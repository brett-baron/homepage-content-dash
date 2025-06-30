import React, { useEffect, useState, useRef, useCallback } from 'react';
import { HomeAppSDK } from '@contentful/app-sdk';
import { useCMA, useSDK } from '@contentful/react-apps-toolkit';
import { CalendarDays, Clock, Edit, FileText, RefreshCw, Timer } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ContentTable } from "@/components/content-table"
import ContentTrendsTabs from "@/components/content-trends-tabs"
import { EntryProps } from 'contentful-management';
import { ContentEntryTabs } from '@/components/ContentEntryTabs';
import { formatPercentageChange } from "../../utils/calculations"
import { CachedAnalyticsService } from "../../utils/serverlessAnalytics"

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
  [key: string]: string;
}

interface DashboardAppInstallationParameters {
  trackedContentTypes: string[];
  needsUpdateMonths: number;
  defaultTimeRange: 'all' | 'year' | '6months';
  recentlyPublishedDays: number;
  showUpcomingReleases: boolean;
  timeToPublishDays: number;
}

const HomeServerless = () => {
  const sdk = useSDK<HomeAppSDK>();
  const cma = useCMA();
  
  // Analytics service
  const [analyticsService] = useState(() => new CachedAnalyticsService(sdk));
  
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
  
  // Content entries - these are still fetched directly for display purposes
  const [scheduledContent, setScheduledContent] = useState<EntryProps[]>([]);
  const [recentlyPublishedContent, setRecentlyPublishedContent] = useState<EntryProps[]>([]);
  const [needsUpdateContent, setNeedsUpdateContent] = useState<EntryProps[]>([]);
  
  // Configuration
  const [trackedContentTypes, setTrackedContentTypes] = useState<string[]>([]);
  const [needsUpdateMonths, setNeedsUpdateMonths] = useState<number>(6);
  const [recentlyPublishedDays, setRecentlyPublishedDays] = useState<number>(7);
  const [showUpcomingReleases, setShowUpcomingReleases] = useState<boolean>(true);
  const [timeToPublishDays, setTimeToPublishDays] = useState<number>(30);
  const [defaultTimeRange, setDefaultTimeRange] = useState<'all' | 'year' | '6months'>('year');
  
  // Loading states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingTime, setLoadingTime] = useState<number>(0);
  const loadingTimerRef = useRef<NodeJS.Timeout>();

  // Content type chart data
  const [contentTypeChartData, setContentTypeChartData] = useState<{
    contentTypeData: Array<{ date: string; [key: string]: string | number }>;
    contentTypeUpdatedData: Array<{ date: string; [key: string]: string | number }>;
    contentTypes: string[];
  }>({ contentTypeData: [], contentTypeUpdatedData: [], contentTypes: [] });

  // Author chart data
  const [authorChartData, setAuthorChartData] = useState<{
    authorData: Array<{ date: string; [key: string]: string | number }>;
    authorUpdatedData: Array<{ date: string; [key: string]: string | number }>;
    authors: string[];
  }>({ authorData: [], authorUpdatedData: [], authors: [] });

  // Load app parameters
  useEffect(() => {
    const loadAppParameters = async () => {
      try {
        const storedConfig = localStorage.getItem('contentDashboardConfig');
        if (storedConfig) {
          const parsedConfig = JSON.parse(storedConfig) as DashboardAppInstallationParameters;
          setTrackedContentTypes(parsedConfig.trackedContentTypes || []);
          setNeedsUpdateMonths(parsedConfig.needsUpdateMonths || 6);
          setRecentlyPublishedDays(parsedConfig.recentlyPublishedDays || 7);
          setShowUpcomingReleases(parsedConfig.showUpcomingReleases ?? true);
          setTimeToPublishDays(parsedConfig.timeToPublishDays || 30);
          setDefaultTimeRange(parsedConfig.defaultTimeRange || 'year');
          return;
        }

        // Set defaults
        setTrackedContentTypes([]);
        setNeedsUpdateMonths(6);
        setRecentlyPublishedDays(7);
        setShowUpcomingReleases(true);
        setTimeToPublishDays(30);
        setDefaultTimeRange('year');
      } catch (error) {
        console.error('Error loading app parameters:', error);
      }
    };

    loadAppParameters();
  }, []);

  // Loading timer
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

  // User cache function
  const getUserFullName = useCallback(async (userId: string): Promise<string> => {
    if (userCache[userId]) {
      return userCache[userId];
    }

    try {
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

  // Main data fetching effect using serverless functions
  useEffect(() => {
    const fetchContentData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Use serverless functions for heavy analytics processing
        const analyticsParams = {
          timeRange: defaultTimeRange,
          trackedContentTypes,
          needsUpdateMonths,
          recentlyPublishedDays,
          timeToPublishDays
        };

        // Fetch analytics data from serverless functions in parallel
        const [
          analyticsData,
          // Still fetch some data directly for display purposes
          scheduledActionsResponse,
          recentlyPublishedResponse,
          needsUpdateResponse
        ] = await Promise.all([
          analyticsService.getBatchAnalytics(analyticsParams),
          // Scheduled actions for releases
          cma.scheduledActions.getMany({
            spaceId: sdk.ids.space,
            query: {
              'environment.sys.id': sdk.ids.environment,
              'sys.status[in]': 'scheduled',
              'order': 'scheduledFor.datetime',
              'limit': 100
            }
          }),
          // Recently published content for display
          cma.entry.getMany({
            spaceId: sdk.ids.space,
            environmentId: sdk.ids.environment,
            query: {
              'sys.publishedAt[gte]': new Date(Date.now() - recentlyPublishedDays * 24 * 60 * 60 * 1000).toISOString(),
              'order': '-sys.publishedAt',
              'limit': 100
            }
          }),
          // Needs update content for display
          cma.entry.getMany({
            spaceId: sdk.ids.space,
            environmentId: sdk.ids.environment,
            query: {
              'sys.publishedAt[exists]': true,
              'sys.updatedAt[lte]': new Date(Date.now() - needsUpdateMonths * 30 * 24 * 60 * 60 * 1000).toISOString(),
              'order': 'sys.updatedAt',
              'limit': 100
            }
          })
        ]);

        // Process scheduled releases (still done client-side for now)
        const now = new Date();
        const scheduledEntryIds = new Set<string>();
        const releaseIds = new Set<string>();

        scheduledActionsResponse.items.forEach(action => {
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
            const releases = await Promise.all(
              Array.from(releaseIds).map(releaseId => 
                cma.release.get({
                  spaceId: sdk.ids.space,
                  environmentId: sdk.ids.environment,
                  releaseId
                })
              )
            );

            const users = await cma.user.getManyForSpace({
              spaceId: sdk.ids.space
            });
            
            const userMap = Object.fromEntries(
              users.items.map(user => [
                user.sys.id,
                user.firstName && user.lastName 
                  ? `${user.firstName} ${user.lastName}`
                  : user.email || user.sys.id
              ])
            );

            releases.forEach(release => {
              if (release.entities?.items) {
                release.entities.items.forEach((entity: { sys: { id: string } }) => {
                  if (entity.sys?.id) {
                    scheduledEntryIds.add(entity.sys.id);
                  }
                });
              }
            });

            releasesData = releases.map(release => {
              const scheduledAction = scheduledActionsResponse.items.find(
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

        // Fetch scheduled entries
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

        // Update states with serverless analytics data
        setStats({
          ...analyticsData.stats,
          scheduledCount: scheduled.length // Override with actual scheduled count
        });
        setChartData(analyticsData.chartData.newContent);
        setUpdatedChartData(analyticsData.chartData.updatedContent);
        setContentTypeChartData({
          contentTypeData: analyticsData.contentTypeData.contentTypeData,
          contentTypeUpdatedData: analyticsData.contentTypeData.contentTypeUpdatedData,
          contentTypes: analyticsData.contentTypeData.contentTypes
        });
        setAuthorChartData(analyticsData.authorData);
        
        // Set content for display
        setScheduledReleases(releasesData);
        setScheduledContent(scheduled);
        setRecentlyPublishedContent(recentlyPublishedResponse.items);
        setNeedsUpdateContent(needsUpdateResponse.items);

        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching content data:', error);
        setError('Failed to load content data');
        setIsLoading(false);
      }
    };

    fetchContentData();
  }, [analyticsService, cma, sdk.ids.space, sdk.ids.environment, trackedContentTypes, needsUpdateMonths, recentlyPublishedDays, timeToPublishDays, defaultTimeRange]);

  const handleRefresh = useCallback(() => {
    analyticsService.clearCache();
    // Trigger re-fetch by updating a dependency
    setIsLoading(true);
  }, [analyticsService]);

  const handleOpenEntry = (entryId: string) => {
    if (!sdk || !sdk.ids) return;
    
    const baseUrl = 'https://app.contentful.com';
    const url = `${baseUrl}/spaces/${sdk.ids.space}/environments/${sdk.ids.environment}/entries/${entryId}`;
    
    window.open(url, '_blank');
  };

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
    setScheduledReleases(prev => prev.filter(release => release.id !== releaseId));
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex justify-between items-center">
          <h1 className="text-4xl font-bold">Content Dashboard (Serverless)</h1>
          <button 
            onClick={handleRefresh}
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
              <p className="mt-4 text-muted-foreground">Loading content data via serverless functions...</p>
              {loadingTime > 0 && (
                <p className="text-sm text-muted-foreground/60">Loading time: {loadingTime}s</p>
              )}
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

            {/* Content Publishing Trends Section */}
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Content Publishing Trends (Serverless)</h2>
              <ContentTrendsTabs
                chartData={chartData}
                updatedChartData={updatedChartData}
                contentTypeData={contentTypeChartData.contentTypeData}
                contentTypeUpdatedData={contentTypeChartData.contentTypeUpdatedData}
                contentTypes={contentTypeChartData.contentTypes}
                authorData={authorChartData.authorData}
                authorUpdatedData={authorChartData.authorUpdatedData}
                authors={authorChartData.authors}
                defaultTimeRange={defaultTimeRange}
              />
            </div>

            {/* Upcoming Releases Section */}
            {showUpcomingReleases && (
              <div className="flex flex-col gap-2 md:gap-4">
                <h2 className="text-xl font-semibold">Upcoming Scheduled Releases</h2>
                {scheduledReleases.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <CalendarDays className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <h3 className="text-lg font-medium text-muted-foreground mb-2">No scheduled releases</h3>
                      <p className="text-sm text-muted-foreground/80 text-center max-w-md">
                        Releases will appear here when they are scheduled.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <ContentTable
                    data={scheduledReleases}
                    showItemCount={true}
                    showUpdatedAt={true}
                    showUpdatedBy={true}
                    onReschedule={handleRescheduleRelease}
                    onCancel={handleCancelRelease}
                    hideActions={false}
                  />
                )}
              </div>
            )}

            <ContentEntryTabs
              scheduledContent={scheduledContent}
              recentlyPublishedContent={recentlyPublishedContent}
              needsUpdateContent={needsUpdateContent}
              userCache={userCache}
              onResolveUser={getUserFullName}
              onOpenEntry={handleOpenEntry}
              needsUpdateMonths={needsUpdateMonths}
              recentlyPublishedDays={recentlyPublishedDays}
            />
          </>
        )}
      </main>
    </div>
  );
};

export default HomeServerless; 