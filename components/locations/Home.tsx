import React, { useEffect, useState, useRef, useCallback } from 'react';
import { HomeAppSDK } from '@contentful/app-sdk';
import { useCMA, useSDK } from '@contentful/react-apps-toolkit';
import { CalendarDays, Clock, Edit, FileText, GitBranchPlus, RefreshCw, Timer, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ContentTable } from "@/components/content-table"
import ContentTrendsTabs from "@/components/content-trends-tabs"
import { getContentStatsPaginated, fetchEntriesByType, fetchChartData, calculateAverageTimeToPublish, fetchContentTypeChartData } from '../../utils/contentful';
import { EntryProps } from 'contentful-management';
import { ContentEntryTabs } from '@/components/ContentEntryTabs';
import { formatPercentageChange } from "../../utils/calculations"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
  trackedContentTypes: string[];
  needsUpdateMonths: number;
  defaultTimeRange: 'all' | 'year' | '6months';
  recentlyPublishedDays: number;
  showUpcomingReleases: boolean;
  timeToPublishDays: number;
}

// Add this new interface after the existing interfaces
interface User {
  sys: {
    id: string;
  };
  firstName?: string;
  lastName?: string;
  email?: string;
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
  const [trackedContentTypes, setTrackedContentTypes] = useState<string[]>([]);
  const [needsUpdateMonths, setNeedsUpdateMonths] = useState<number>(6);
  const [recentlyPublishedDays, setRecentlyPublishedDays] = useState<number>(7);
  const [showUpcomingReleases, setShowUpcomingReleases] = useState<boolean>(true);
  const [timeToPublishDays, setTimeToPublishDays] = useState<number>(30);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [defaultTimeRange, setDefaultTimeRange] = useState<'all' | 'year' | '6months'>('year');

  // Add loading timer state
  const [loadingTime, setLoadingTime] = useState<number>(0);
  const loadingTimerRef = useRef<NodeJS.Timeout>();

  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: string; name: string }>>([]);

  // Add new state for all users
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Effect to load app installation parameters
  useEffect(() => {
    const loadAppParameters = async () => {
      try {
        // Try to get parameters from localStorage first
        const storedConfig = localStorage.getItem('contentDashboardConfig');
        
        if (storedConfig) {
          try {
            const parsedConfig = JSON.parse(storedConfig);
            
            // Clean up the configuration by only taking the fields we need
            const cleanConfig = {
              trackedContentTypes: parsedConfig.trackedContentTypes || [],
              needsUpdateMonths: parsedConfig.needsUpdateMonths || 6,
              defaultTimeRange: (parsedConfig.defaultTimeRange || 'year') as 'all' | 'year' | '6months',
              recentlyPublishedDays: parsedConfig.recentlyPublishedDays || 7,
              showUpcomingReleases: parsedConfig.showUpcomingReleases ?? true,
              timeToPublishDays: parsedConfig.timeToPublishDays || 30
            };
            
            // Save the cleaned config back to localStorage
            localStorage.setItem('contentDashboardConfig', JSON.stringify(cleanConfig));
            
            // Update all state values
            setTrackedContentTypes(cleanConfig.trackedContentTypes);
            setNeedsUpdateMonths(cleanConfig.needsUpdateMonths);
            setRecentlyPublishedDays(cleanConfig.recentlyPublishedDays);
            setShowUpcomingReleases(cleanConfig.showUpcomingReleases);
            setTimeToPublishDays(cleanConfig.timeToPublishDays);
            setDefaultTimeRange(cleanConfig.defaultTimeRange);
            
            return;
          } catch (error) {
            console.error('Error parsing stored config:', error);
          }
        }

        // If not in localStorage or parsing failed, use default values
        const defaultConfig = {
          trackedContentTypes: [],
          needsUpdateMonths: 6,
          defaultTimeRange: 'year' as const,
          recentlyPublishedDays: 7,
          showUpcomingReleases: true,
          timeToPublishDays: 30
        };
        
        // Save default config to localStorage
        localStorage.setItem('contentDashboardConfig', JSON.stringify(defaultConfig));
        
        // Set all state values to defaults
        setTrackedContentTypes(defaultConfig.trackedContentTypes);
        setNeedsUpdateMonths(defaultConfig.needsUpdateMonths);
        setRecentlyPublishedDays(defaultConfig.recentlyPublishedDays);
        setShowUpcomingReleases(defaultConfig.showUpcomingReleases);
        setTimeToPublishDays(defaultConfig.timeToPublishDays);
        setDefaultTimeRange(defaultConfig.defaultTimeRange);
      } catch (error) {
        console.error('Error loading app parameters:', error);
        // Use defaults if loading fails
        setTrackedContentTypes([]);
        setNeedsUpdateMonths(6);
        setRecentlyPublishedDays(7);
        setShowUpcomingReleases(true);
        setTimeToPublishDays(30);
        setDefaultTimeRange('year');
      }
    };

    loadAppParameters();
  }, []);

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

  // Add this new effect at the start of the component
  useEffect(() => {
    const fetchAllUsers = async () => {
      try {
        const response = await cma.user.getManyForSpace({
          spaceId: sdk.ids.space
        });
        
        setAllUsers(response.items);
        
        // Pre-populate the userCache with all users
        const newUserCache: UserCache = {};
        response.items.forEach(user => {
          const fullName = user.firstName && user.lastName 
            ? `${user.firstName} ${user.lastName}`
            : user.email || user.sys.id;
          newUserCache[user.sys.id] = fullName;
        });
        setUserCache(newUserCache);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };

    fetchAllUsers();
  }, [cma, sdk.ids.space]);

  // Replace the getUserFullName function with this version
  const getUserFullName = useCallback(async (userId: string): Promise<string> => {
    // Check memory cache first
    if (userCache[userId]) {
      return userCache[userId];
    }

    // Find user in allUsers if not in cache
    const user = allUsers.find(u => u.sys.id === userId);
    if (user) {
      const fullName = user.firstName && user.lastName 
        ? `${user.firstName} ${user.lastName}`
        : user.email || userId;
      
      // Update cache
      setUserCache(prev => ({
        ...prev,
        [userId]: fullName
      }));
      
      return fullName;
    }

    return userId;
  }, [userCache, allUsers]);

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
          
          if (parsedConfig.trackedContentTypes && Array.isArray(parsedConfig.trackedContentTypes)) {
            setTrackedContentTypes(parsedConfig.trackedContentTypes);
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
      
      const defaultTrackedBase = ['page', 'settings', 'navigation', 'siteConfig'];
      const defaultTracked = defaultTrackedBase.filter(id => 
        availableContentTypeIds.includes(id)
      );
      
      setTrackedContentTypes(defaultTracked);
      
      localStorage.setItem('contentDashboardConfig', JSON.stringify({ 
        trackedContentTypes: defaultTracked,
        needsUpdateMonths: 6,
        recentlyPublishedDays: 7,
        showUpcomingReleases: true,
        timeToPublishDays: 30,
        defaultTimeRange: 'year'
      }));
    } catch (error) {
      console.error('Error setting up tracked content types:', error);
      setTrackedContentTypes([]);
    }
  }, [getContentTypes]);

  const [contentTypeChartData, setContentTypeChartData] = useState<{
    contentTypeData: Array<{ date: string; [key: string]: string | number }>;
    contentTypeUpdatedData: Array<{ date: string; [key: string]: string | number }>;
    contentTypes: string[];
  }>({ contentTypeData: [], contentTypeUpdatedData: [], contentTypes: [] });

  // Add new state for author data
  const [authorChartData, setAuthorChartData] = useState<{
    authorData: Array<{ date: string; [key: string]: string | number }>;
    authorUpdatedData: Array<{ date: string; [key: string]: string | number }>;
    authors: string[];
  }>({ authorData: [], authorUpdatedData: [], authors: [] });

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
          contentTypeDataFromApi,
          recentlyPublishedResponse,
          needsUpdateResponse,
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
            { monthsToShow: 12 }
          ),
          fetchContentTypeChartData(
            cma,
            sdk.ids.space,
            sdk.ids.environment,
            { 
              trackedContentTypes,
              monthsToShow: 12
            }
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
          // Average time to publish
          calculateAverageTimeToPublish(
            cma,
            sdk.ids.space,
            sdk.ids.environment,
            timeToPublishDays
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

        // Get content stats after we have all the scheduled actions processed
        const contentStats = await getContentStatsPaginated(
          cma,
          sdk.ids.space,
          sdk.ids.environment,
          scheduledActions.items,
          recentlyPublishedDays,
          needsUpdateMonths,
          trackedContentTypes
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
        
        // Update content type chart data
        setContentTypeChartData({
          contentTypeData: contentTypeDataFromApi.contentTypeData,
          contentTypeUpdatedData: contentTypeDataFromApi.contentTypeUpdatedData,
          contentTypes: contentTypeDataFromApi.contentTypes
        });
        
        // Process author data from recentlyPublishedResponse and needsUpdateResponse
        const authorData = new Map<string, Map<string, number>>();
        const authorUpdatedData = new Map<string, Map<string, number>>();
        const authorIdToName = new Map<string, string>();
        const authors = new Set<string>();

        // Helper function to process entries by date and author
        const processEntriesByAuthor = async (entries: any[], dataMap: Map<string, Map<string, number>>, useUpdateDate = false) => {
          for (const entry of entries) {
            const date = new Date(
              useUpdateDate 
                ? (new Date(entry.sys.publishedAt || 0) > new Date(entry.sys.updatedAt || 0) 
                  ? entry.sys.publishedAt 
                  : entry.sys.updatedAt)
                : (entry.sys.firstPublishedAt || entry.sys.publishedAt)
            );
            
            const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            // Skip if the entry doesn't have the required date
            if (!date || isNaN(date.getTime())) continue;

            // For new content: use publishedBy (or fall back to createdBy)
            // For updated content: use updatedBy for updates, publishedBy for new publishes
            const authorId = useUpdateDate
              ? (new Date(entry.sys.publishedAt || 0) > new Date(entry.sys.updatedAt || 0)
                ? entry.sys.publishedBy?.sys.id
                : entry.sys.updatedBy?.sys.id)
              : (entry.sys.publishedBy?.sys.id || entry.sys.createdBy?.sys.id);

            if (!authorId) continue;

            // Get author name from cache or fetch it
            let authorName = authorIdToName.get(authorId);
            if (!authorName) {
              authorName = await getUserFullName(authorId);
              authorIdToName.set(authorId, authorName);
            }
            authors.add(authorName);

            if (!dataMap.has(monthYear)) {
              dataMap.set(monthYear, new Map());
            }
            const monthData = dataMap.get(monthYear)!;
            monthData.set(authorName, (monthData.get(authorName) || 0) + 1);
          }
        };

        // Process entries for both new and updated content
        const publishedEntries = [...recentlyPublishedResponse.items, ...needsUpdateResponse.items]
          .filter(entry => entry.sys.firstPublishedAt || entry.sys.publishedAt)
          .sort((a, b) => {
            const aDate = new Date(a.sys.firstPublishedAt || a.sys.publishedAt || 0);
            const bDate = new Date(b.sys.firstPublishedAt || b.sys.publishedAt || 0);
            return aDate.getTime() - bDate.getTime();
          });

        const updatedEntries = [...recentlyPublishedResponse.items, ...needsUpdateResponse.items]
          .filter(entry => entry.sys.publishedAt || entry.sys.updatedAt)
          .sort((a, b) => {
            const aDate = new Date(Math.max(
              new Date(a.sys.publishedAt || 0).getTime(),
              new Date(a.sys.updatedAt || 0).getTime()
            ));
            const bDate = new Date(Math.max(
              new Date(b.sys.publishedAt || 0).getTime(),
              new Date(b.sys.updatedAt || 0).getTime()
            ));
            return aDate.getTime() - bDate.getTime();
          });

        // Process both sets of entries
        await Promise.all([
          processEntriesByAuthor(publishedEntries, authorData, false),
          processEntriesByAuthor(updatedEntries, authorUpdatedData, true)
        ]);

        // Convert the Maps to the required format
        const convertMapToChartData = (dataMap: Map<string, Map<string, number>>) => {
          // Get all dates in range
          const now = new Date();
          const dates = new Set<string>();
          
          // Add all months in the last year
          for (let i = 0; i < 12; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            dates.add(monthYear);
          }

          // Add any existing dates from the data
          dataMap.forEach((_, date) => dates.add(date));

          // Convert to array and sort
          const sortedDates = Array.from(dates).sort();
          const sortedAuthors = Array.from(authors).sort();

          return sortedDates.map(date => {
            const monthData = dataMap.get(date) || new Map();
            return {
              date,
              ...Object.fromEntries(
                sortedAuthors.map(author => [
                  author,
                  monthData.get(author) || 0
                ])
              )
            };
          });
        };

        // Update author chart data state
        setAuthorChartData({
          authorData: convertMapToChartData(authorData),
          authorUpdatedData: convertMapToChartData(authorUpdatedData),
          authors: Array.from(authors).sort()
        });
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching content stats:', error);
        setError('Failed to load content data');
        setIsLoading(false);
      }
    };

    fetchContentStats();
  }, [cma, sdk.ids.space, sdk.ids.environment, trackedContentTypes, needsUpdateMonths, recentlyPublishedDays, timeToPublishDays]);

  // Add this effect to update available users whenever the content changes
  useEffect(() => {
    const uniqueUsers = new Set<string>();
    
    // Collect users from all content
    [...scheduledContent, ...recentlyPublishedContent, ...needsUpdateContent].forEach(entry => {
      const publishedBy = entry.sys.publishedBy?.sys.id;
      const updatedBy = entry.sys.updatedBy?.sys.id;
      const createdBy = entry.sys.createdBy?.sys.id;
      
      if (publishedBy) uniqueUsers.add(publishedBy);
      if (updatedBy) uniqueUsers.add(updatedBy);
      if (createdBy) uniqueUsers.add(createdBy);
    });

    // Convert user IDs to names and update state
    Promise.all(
      Array.from(uniqueUsers).map(async userId => ({
        id: userId,
        name: await getUserFullName(userId)
      }))
    ).then(users => {
      setAvailableUsers(users.sort((a, b) => a.name.localeCompare(b.name)));
    });
  }, [scheduledContent, recentlyPublishedContent, needsUpdateContent, getUserFullName]);

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

  return (
    <div className="flex min-h-screen w-full flex-col">
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-6">
            <h1 className="text-4xl font-bold">Content Dashboard</h1>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Team Members</SelectItem>
                  {availableUsers.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
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
              <p className="mt-2 text-sm text-muted-foreground">
                Time elapsed: {loadingTime} seconds
              </p>
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
              <h2 className="text-xl font-semibold">Content Publishing Trends</h2>
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

export default Home;
