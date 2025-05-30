import React, { useEffect, useState, useRef, useCallback } from 'react';
import { HomeAppSDK } from '@contentful/app-sdk';
import { useCMA, useSDK } from '@contentful/react-apps-toolkit';
import { CalendarDays, Clock, Edit, FileText, GitBranchPlus, RefreshCw, Timer } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ContentTable } from "@/components/content-table"
import ContentChart from "@/components/content-chart"
import { getContentStatsPaginated, fetchEntriesByType, fetchChartData, calculateAverageTimeToPublish } from '../../utils/contentful';
import { EntryProps } from 'contentful-management';
import { ContentEntryTabs } from '@/components/ContentEntryTabs';
import { AppInstallationParameters } from './ConfigScreen';
import { formatPercentageChange } from "../../utils/calculations"

interface ScheduledRelease {
  id: string;
  title: string;
  scheduledDateTime: string;
  status: string;
  itemCount: number;
  updatedAt: string;
  updatedBy: string;
}

interface UserCache {
  [key: string]: string;  // userId -> user's full name
}

interface ContentType {
  sys: {
    id: string;
  };
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

interface CachedData<T> {
  data: T;
  timestamp: number;
}

// Add before the Home component
const cache = {
  users: new Map<string, CachedData<string>>(),
  contentTypes: new Map<string, CachedData<any>>(),
};

interface DashboardAppInstallationParameters {
  excludedContentTypes: string[];
  needsUpdateMonths: number;
  recentlyPublishedDays: number;
  showUpcomingReleases: boolean;
  timeToPublishDays: number;
}

const Home = () => {
  const sdk = useSDK<HomeAppSDK>();
  const cma = useCMA();
  const [stats, setStats] = useState({
    totalPublished: 0,
    percentChange: 0,
    scheduledCount: 0,
    recentlyPublishedCount: 0,
    needsUpdateCount: 0,
    previousMonthPublished: 0,
    averageTimeToPublish: 0,
  });
  const [chartData, setChartData] = useState<Array<{ date: string; count: number }>>([]);
  const [updatedChartData, setUpdatedChartData] = useState<Array<{ date: string; count: number }>>([]);
  const [scheduledReleases, setScheduledReleases] = useState<ScheduledRelease[]>([]);
  const [userCache, setUserCache] = useState<UserCache>({});
  
  // New state for content entries
  const [scheduledContent, setScheduledContent] = useState<EntryProps[]>([]);
  const [recentlyPublishedContent, setRecentlyPublishedContent] = useState<EntryProps[]>([]);
  const [needsUpdateContent, setNeedsUpdateContent] = useState<EntryProps[]>([]);
  const [orphanedContent, setOrphanedContent] = useState<EntryProps[]>([]);
  const [excludedContentTypes, setExcludedContentTypes] = useState<string[]>([]);
  const [needsUpdateMonths, setNeedsUpdateMonths] = useState<number>(6);
  const [recentlyPublishedDays, setRecentlyPublishedDays] = useState<number>(7);
  const [showUpcomingReleases, setShowUpcomingReleases] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Add loading timer state
  const [loadingTime, setLoadingTime] = useState<number>(0);
  const loadingTimerRef = useRef<NodeJS.Timeout>();

  // Start loading timer when loading begins
  useEffect(() => {
    if (isLoading) {
      const startTime = Date.now();
      loadingTimerRef.current = setInterval(() => {
        setLoadingTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      if (loadingTimerRef.current) {
        clearInterval(loadingTimerRef.current);
      }
      setLoadingTime(0);
    }
    
    return () => {
      if (loadingTimerRef.current) {
        clearInterval(loadingTimerRef.current);
      }
    };
  }, [isLoading]);

  // Fix the getUserFullName function to use getManyForSpace
  const getUserFullName = useCallback(async (userId: string): Promise<string> => {
    // Check memory cache first
    if (userCache[userId]) {
      return userCache[userId];
    }

    // Check cache
    const cachedUser = cache.users.get(userId);
    if (cachedUser && Date.now() - cachedUser.timestamp < CACHE_DURATION) {
      // Update component state cache
      setUserCache(prev => ({
        ...prev,
        [userId]: cachedUser.data
      }));
      return cachedUser.data;
    }

    try {
      // Use getManyForSpace instead of getMany
      const users = await cma.user.getManyForSpace({
        spaceId: sdk.ids.space
      });
      
      const user = users.items.find(u => u.sys.id === userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      const fullName = user.firstName && user.lastName 
        ? `${user.firstName} ${user.lastName}`
        : user.email || userId;

      // Update both caches
      cache.users.set(userId, {
        data: fullName,
        timestamp: Date.now()
      });

      setUserCache(prev => ({
        ...prev,
        [userId]: fullName
      }));

      return fullName;
    } catch (error) {
      console.error(`Error fetching user data for ${userId}:`, error);
      return userId;
    }
  }, [cma, sdk.ids.space, userCache]);

  // Add a function to fetch content types with caching
  const getContentTypes = useCallback(async () => {
    const cacheKey = `${sdk.ids.space}-${sdk.ids.environment}`;
    const cachedTypes = cache.contentTypes.get(cacheKey);
    
    if (cachedTypes && Date.now() - cachedTypes.timestamp < CACHE_DURATION) {
      return cachedTypes.data;
    }

    const contentTypesResponse = await cma.contentType.getMany({
      spaceId: sdk.ids.space,
      environmentId: sdk.ids.environment
    });

    cache.contentTypes.set(cacheKey, {
      data: contentTypesResponse,
      timestamp: Date.now()
    });

    return contentTypesResponse;
  }, [cma, sdk.ids.space, sdk.ids.environment]);

  // Update the fetchAppInstallationParameters function to use cached content types
  const fetchAppInstallationParameters = useCallback(async () => {
    try {
      const storedConfig = localStorage.getItem('contentDashboardConfig');
      
      if (storedConfig) {
        try {
          const parsedConfig = JSON.parse(storedConfig) as DashboardAppInstallationParameters;
          
          if (parsedConfig.excludedContentTypes && Array.isArray(parsedConfig.excludedContentTypes)) {
            setExcludedContentTypes(parsedConfig.excludedContentTypes);
          }
          
          if (parsedConfig.needsUpdateMonths && parsedConfig.needsUpdateMonths > 0) {
            setNeedsUpdateMonths(parsedConfig.needsUpdateMonths);
          }
          
          if (parsedConfig.recentlyPublishedDays && parsedConfig.recentlyPublishedDays > 0) {
            setRecentlyPublishedDays(parsedConfig.recentlyPublishedDays);
          }
          
          if (parsedConfig.showUpcomingReleases !== undefined) {
            setShowUpcomingReleases(parsedConfig.showUpcomingReleases);
          }

          if (parsedConfig.timeToPublishDays && parsedConfig.timeToPublishDays > 0) {
            setTimeToPublishDays(parsedConfig.timeToPublishDays);
          }
          
          return;
        } catch (e) {
          console.error('Error parsing stored config:', e);
        }
      }
      
      // Get content types from cache or API
      const contentTypesResponse = await getContentTypes();
      const availableContentTypeIds = contentTypesResponse.items.map((ct: ContentType) => ct.sys.id);
      
      const defaultExcludedBase = ['page', 'settings', 'navigation', 'siteConfig'];
      const defaultExcluded = defaultExcludedBase.filter(id => 
        availableContentTypeIds.includes(id)
      );
      
      setExcludedContentTypes(defaultExcluded);
      
      localStorage.setItem('contentDashboardConfig', JSON.stringify({ 
        excludedContentTypes: defaultExcluded,
        needsUpdateMonths: 6,
        recentlyPublishedDays: 7,
        showUpcomingReleases: true,
        timeToPublishDays: 30
      }));
    } catch (error) {
      console.error('Error setting up excluded content types:', error);
      setExcludedContentTypes([]);
    }
  }, [getContentTypes]);

  const [timeToPublishDays, setTimeToPublishDays] = useState<number>(30);

  useEffect(() => {
    const fetchContentStats = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Make initial API calls in parallel
        const [
          space,
          environment,
          scheduledActions,
          chartDataFromApi,
          recentlyPublishedResponse,
          needsUpdateResponse,
          orphanedResponse,
          averageTimeToPublish
        ] = await Promise.all([
          cma.space.get({ spaceId: sdk.ids.space }),
          cma.environment.get({
            spaceId: sdk.ids.space,
            environmentId: sdk.ids.environment
          }),
          cma.scheduledActions.getMany({
            spaceId: sdk.ids.space,
            query: {
              'environment.sys.id': sdk.ids.environment,
              'sys.status[in]': 'scheduled',
              'order': 'scheduledFor.datetime',
              'limit': 500
            }
          }),
          fetchChartData(
            cma,
            sdk.ids.space,
            sdk.ids.environment,
            { excludedContentTypes }
          ),
          // Recently published content
          fetchEntriesByType(
            cma,
            sdk.ids.space,
            sdk.ids.environment,
            {
              'sys.publishedAt[gte]': new Date(Date.now() - recentlyPublishedDays * 24 * 60 * 60 * 1000).toISOString(),
              'order': '-sys.publishedAt',
              'limit': 100
            }
          ),
          // Needs update content
          fetchEntriesByType(
            cma,
            sdk.ids.space,
            sdk.ids.environment,
            {
              'sys.publishedAt[exists]': true,
              'sys.updatedAt[lte]': new Date(Date.now() - needsUpdateMonths * 30 * 24 * 60 * 60 * 1000).toISOString(),
              'order': 'sys.updatedAt',
              'limit': 100
            }
          ),
          // Orphaned content
          fetchEntriesByType(
            cma,
            sdk.ids.space,
            sdk.ids.environment,
            {
              'sys.publishedAt[exists]': true,
              'limit': 100,
              'order': '-sys.updatedAt'
            }
          ),
          // Average time to publish
          calculateAverageTimeToPublish(
            cma,
            sdk.ids.space,
            sdk.ids.environment,
            timeToPublishDays,
            excludedContentTypes
          )
        ]);

        // Process releases and scheduled entries
        const now = new Date();
        const scheduledEntryIds = new Set<string>();
        const releaseIds = new Set<string>();

        // First pass: collect all entry and release IDs
        scheduledActions.items.forEach(action => {
          if (action.sys.status === 'scheduled' && 
              new Date(action.scheduledFor.datetime) > now &&
              action.action === 'publish') {
            
            if (action.entity.sys.linkType === 'Entry') {
              scheduledEntryIds.add(action.entity.sys.id);
            } else if (action.entity.sys.linkType === 'Release') {
              releaseIds.add(action.entity.sys.id);
            }
          }
        });

        // Process releases if any exist
        let releasesData: ScheduledRelease[] = [];
        if (releaseIds.size > 0) {
          try {
            // Fetch releases
            const releases = await Promise.all(
              Array.from(releaseIds).map(releaseId => 
                cma.release.get({
                  spaceId: sdk.ids.space,
                  environmentId: sdk.ids.environment,
                  releaseId
                })
              )
            );

            // Get all users for the space
            const users = await cma.user.getManyForSpace({
              spaceId: sdk.ids.space
            });
            
            // Create user map
            const userMap = Object.fromEntries(
              users.items.map(user => [
                user.sys.id,
                user.firstName && user.lastName 
                  ? `${user.firstName} ${user.lastName}`
                  : user.email || user.sys.id
              ])
            );

            // Add release entries to scheduledEntryIds
            releases.forEach(release => {
              if (release.entities?.items) {
                release.entities.items.forEach((entity: { sys: { id: string } }) => {
                  if (entity.sys?.id) {
                    scheduledEntryIds.add(entity.sys.id);
                  }
                });
              }
            });

            // Process releases data
            releasesData = releases.map(release => {
              const scheduledAction = scheduledActions.items.find(
                action => action.entity.sys.id === release.sys.id
              );
              return {
                id: release.sys.id,
                title: release.title,
                scheduledDateTime: scheduledAction?.scheduledFor.datetime || new Date().toISOString(),
                status: 'Scheduled',
                itemCount: release.entities?.items?.length || 0,
                updatedAt: release.sys.updatedAt,
                updatedBy: userMap[release.sys.updatedBy.sys.id] || release.sys.updatedBy.sys.id
              };
            }).sort((a, b) => new Date(a.scheduledDateTime).getTime() - new Date(b.scheduledDateTime).getTime());
          } catch (error) {
            console.error('Error fetching releases:', error);
          }
        }

        // Fetch scheduled entries if any exist
        let scheduled: EntryProps[] = [];
        if (scheduledEntryIds.size > 0) {
          const idArray = Array.from(scheduledEntryIds);
          const batchSize = 100;
          const batchPromises = [];
          
          for (let i = 0; i < idArray.length; i += batchSize) {
            const batchIds = idArray.slice(i, i + batchSize);
            batchPromises.push(
              cma.entry.getMany({
                spaceId: sdk.ids.space,
                environmentId: sdk.ids.environment,
                query: {
                  'sys.id[in]': batchIds.join(','),
                  limit: batchSize
                }
              })
            );
          }
          
          const batchResults = await Promise.all(batchPromises);
          scheduled = batchResults.flatMap(result => result.items);
        }

        // Filter orphaned content
        const filteredOrphaned = orphanedResponse.items.filter((entry: EntryProps) => 
          !(entry.sys.contentType && 
            excludedContentTypes.includes(entry.sys.contentType.sys.id))
        );

        // Get content stats after we have all the scheduled actions processed
        const contentStats = await getContentStatsPaginated(
          cma,
          sdk.ids.space,
          sdk.ids.environment,
          scheduledActions.items,
          recentlyPublishedDays,
          needsUpdateMonths,
          excludedContentTypes
        );

        // Calculate total scheduled entries (direct entries + entries in releases)
        const totalScheduledCount = scheduled.length;

        // Update the stats with the correct scheduled count and average time to publish
        const updatedStats = {
          ...contentStats,
          scheduledCount: totalScheduledCount,
          averageTimeToPublish
        };

        // Update all states at once
        setStats(updatedStats);
        setChartData(chartDataFromApi.newContent);
        setUpdatedChartData(chartDataFromApi.updatedContent);
        setScheduledReleases(releasesData);
        setScheduledContent(scheduled);
        setRecentlyPublishedContent(recentlyPublishedResponse.items);
        setNeedsUpdateContent(needsUpdateResponse.items);
        setOrphanedContent(filteredOrphaned);
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching content stats:', error);
        setError('Failed to load content data');
        setIsLoading(false);
      }
    };

    fetchContentStats();
  }, [cma, sdk.ids.space, sdk.ids.environment, excludedContentTypes, needsUpdateMonths, recentlyPublishedDays, timeToPublishDays]);

  const formatDateTime = (dateTimeStr: string) => {
    const date = new Date(dateTimeStr);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const handleRescheduleRelease = async (releaseId: string, newDateTime: string) => {
    // Refresh the releases data after rescheduling
    const updatedReleases = scheduledReleases.map(release => {
      if (release.id === releaseId) {
        return {
          ...release,
          scheduledDateTime: newDateTime,
          updatedAt: new Date().toISOString()
        };
      }
      return release;
    });
    setScheduledReleases(updatedReleases);
  };

  const handleCancelRelease = async (releaseId: string) => {
    // Remove the canceled release from the list
    setScheduledReleases(prev => prev.filter(release => release.id !== releaseId));
  };

  // Function to open an entry in the Contentful web app
  const handleOpenEntry = (entryId: string) => {
    if (!sdk || !sdk.ids) return;
    
    // Construct the URL to the entry in the Contentful web app
    const baseUrl = 'https://app.contentful.com';
    const url = `${baseUrl}/spaces/${sdk.ids.space}/environments/${sdk.ids.environment}/entries/${entryId}`;
    
    // Open the entry in a new tab
    window.open(url, '_blank');
  };

  // Handle archiving entries
  const handleArchiveEntries = async (entryIds: string[]) => {
    if (!entryIds.length) return;
    
    setIsLoading(true);
    try {
      // Archive each entry
      for (const entryId of entryIds) {
        try {
          // First fetch the entry to get its version
          const entry = await cma.entry.get({
            spaceId: sdk.ids.space,
            environmentId: sdk.ids.environment,
            entryId
          });
          
          // Then archive it
          await cma.entry.archive({
            spaceId: sdk.ids.space,
            environmentId: sdk.ids.environment,
            entryId,
          });
        } catch (error) {
          console.error(`Error archiving entry ${entryId}:`, error);
          // Continue with other entries even if one fails
        }
      }
      
      // Update orphaned content state by removing archived entries
      setOrphanedContent(prev => prev.filter(entry => !entryIds.includes(entry.sys.id)));
      
      // Show success notification
      sdk.notifier.success(`Successfully archived ${entryIds.length} ${entryIds.length === 1 ? 'entry' : 'entries'}`);
    } catch (error) {
      console.error('Error archiving entries:', error);
      sdk.notifier.error('Some entries could not be archived. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle unpublishing entries
  const handleUnpublishEntries = async (entryIds: string[]) => {
    if (!entryIds.length) return;
    
    setIsLoading(true);
    try {
      // Unpublish each entry
      for (const entryId of entryIds) {
        try {
          // Unpublish the entry
          await cma.entry.unpublish({
            spaceId: sdk.ids.space,
            environmentId: sdk.ids.environment,
            entryId
          });
        } catch (error) {
          console.error(`Error unpublishing entry ${entryId}:`, error);
          // Continue with other entries even if one fails
        }
      }
      
      // Update orphaned content state by updating the unpublished entries' status
      setOrphanedContent(prev => prev.map(entry => {
        if (entryIds.includes(entry.sys.id)) {
          return {
            ...entry,
            sys: {
              ...entry.sys,
              publishedVersion: undefined
            }
          };
        }
        return entry;
      }));
      
      // Show success notification
      sdk.notifier.success(`Successfully unpublished ${entryIds.length} ${entryIds.length === 1 ? 'entry' : 'entries'}`);
    } catch (error) {
      console.error('Error unpublishing entries:', error);
      sdk.notifier.error('Some entries could not be unpublished. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Content Dashboard</h1>
          <button 
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-md hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50"
            title="Refresh dashboard"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-gray-400' : 'text-gray-600'}`} />
            <span className="text-sm text-gray-600">Refresh</span>
          </button>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="flex flex-col items-center">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
              <p className="mt-4 text-muted-foreground">Loading content data...</p>
              {/* <p className="mt-2 text-sm text-muted-foreground">Time elapsed: {loadingTime}s</p> */}
            </div>
          </div>
        ) : error ? (
          <div className="bg-destructive/10 p-4 rounded-md">
            <p className="text-destructive">{error}</p>
            <p className="text-sm mt-2">There was an error loading the content data. Please try refreshing the page.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 w-full">
              <Card className="w-full relative">
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <FileText className="h-8 w-8 text-primary" />
                </div>
                <CardHeader className="pb-1 pt-2 px-3 pr-14">
                  <CardTitle className="text-sm font-semibold">Total Published</CardTitle>
                </CardHeader>
                <CardContent className="pb-3 pt-0 px-3 pr-14">
                  <div className="text-3xl font-bold">{stats.totalPublished}</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {stats.previousMonthPublished === 0 && stats.percentChange === 0
                    ? 'No new content published recently'
                    : (
                      <span className={stats.percentChange >= 0 ? "text-green-500" : "text-red-500"}>
                        {formatPercentageChange(stats.percentChange)} publishing {stats.percentChange >= 0 ? 'increase' : 'decrease'} MoM
                      </span>
                    )}
                  </p>
                </CardContent>
              </Card>
              <Card className="w-full relative">
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <CalendarDays className="h-8 w-8 text-primary" />
                </div>
                <CardHeader className="pb-1 pt-2 px-3 pr-14">
                  <CardTitle className="text-sm font-semibold">Scheduled</CardTitle>
                </CardHeader>
                <CardContent className="pb-3 pt-0 px-3 pr-14">
                  <div className="text-3xl font-bold">{stats.scheduledCount}</div>
                  <p className="text-sm text-muted-foreground mt-1">For the next 30 days</p>
                </CardContent>
              </Card>
              <Card className="w-full relative">
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Clock className="h-8 w-8 text-primary" />
                </div>
                <CardHeader className="pb-1 pt-2 px-3 pr-14">
                  <CardTitle className="text-sm font-semibold">Recently Published</CardTitle>
                </CardHeader>
                <CardContent className="pb-3 pt-0 px-3 pr-14">
                  <div className="text-3xl font-bold">{stats.recentlyPublishedCount}</div>
                  <p className="text-sm text-muted-foreground mt-1">In the last {recentlyPublishedDays} {recentlyPublishedDays === 1 ? 'day' : 'days'}</p>
                </CardContent>
              </Card>
              <Card className="w-full relative">
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Edit className="h-8 w-8 text-primary" />
                </div>
                <CardHeader className="pb-1 pt-2 px-3 pr-14">
                  <CardTitle className="text-sm font-semibold">Needs Update</CardTitle>
                </CardHeader>
                <CardContent className="pb-3 pt-0 px-3 pr-14">
                  <div className="text-3xl font-bold">{stats.needsUpdateCount}</div>
                  <p className="text-sm text-muted-foreground mt-1">Content older than {needsUpdateMonths} {needsUpdateMonths === 1 ? 'month' : 'months'}</p>
                </CardContent>
              </Card>
              <Card className="w-full relative">
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Timer className="h-8 w-8 text-primary" />
                </div>
                <CardHeader className="pb-1 pt-2 px-3 pr-14">
                  <CardTitle className="text-sm font-semibold">Average Time to Publish</CardTitle>
                </CardHeader>
                <CardContent className="pb-3 pt-0 px-3 pr-14">
                  <div className="text-3xl font-bold">{stats.averageTimeToPublish.toFixed(1)} days</div>
                  <p className="text-sm text-muted-foreground mt-1">For the last {timeToPublishDays} days</p>
                </CardContent>
              </Card>
            </div>
            <ContentChart
              data={chartData}
              updatedData={updatedChartData}
              title="Content Trends"
            />
            {/* Upcoming Releases Section */}
            {showUpcomingReleases && (
              <div className="flex flex-col gap-2 md:gap-4">
                <h2 className="text-xl font-semibold">Upcoming Scheduled Releases</h2>
                <ContentTable
                  data={scheduledReleases}
                  showItemCount={true}
                  showUpdatedAt={true}
                  showUpdatedBy={true}
                  onReschedule={handleRescheduleRelease}
                  onCancel={handleCancelRelease}
                  hideActions={false}
                />
              </div>
            )}

            <ContentEntryTabs
              scheduledContent={scheduledContent}
              recentlyPublishedContent={recentlyPublishedContent}
              needsUpdateContent={needsUpdateContent}
              orphanedContent={orphanedContent}
              userCache={userCache}
              onResolveUser={getUserFullName}
              onOpenEntry={handleOpenEntry}
              needsUpdateMonths={needsUpdateMonths}
              recentlyPublishedDays={recentlyPublishedDays}
              onArchiveEntries={handleArchiveEntries}
              onUnpublishEntries={handleUnpublishEntries}
            />
          </>
        )}
      </main>
    </div>
  )
};

export default Home;
