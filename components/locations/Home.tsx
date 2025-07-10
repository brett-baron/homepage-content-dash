import React, { useEffect, useState, useRef, useCallback } from 'react';
import { HomeAppSDK } from '@contentful/app-sdk';
import { useCMA, useSDK } from '@contentful/react-apps-toolkit';
import { CalendarDays, Clock, Edit, FileText, GitBranchPlus, RefreshCw, Timer } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ContentTable } from "@/components/content-table"
import ContentTrendsTabs from "@/components/content-trends-tabs"
import { getContentStatsPaginated, fetchEntriesByType, fetchChartData, calculateAverageTimeToPublish, fetchContentTypeChartData } from '../../utils/contentful';
import { EntryProps } from 'contentful-management';
import { ContentEntryTabs } from '@/components/ContentEntryTabs';
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

// Cache constants
const DASHBOARD_CACHE_KEY = 'contentDashboard_cachedData';
const DASHBOARD_CACHE_TIMESTAMP_KEY = 'contentDashboard_cacheTimestamp';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds (increased from 10 minutes to reduce API calls)

interface CachedData<T> {
  data: T;
  timestamp: number;
}

interface DashboardData {
  stats: {
    totalPublished: number;
    percentChange: number;
    scheduledCount: number;
    recentlyPublishedCount: number;
    needsUpdateCount: number;
    previousMonthPublished: number;
    averageTimeToPublish: number;
  };
  chartData: Array<{ date: string; count: number }>;
  scheduledReleases: ScheduledRelease[];
  userCache: UserCache;
  scheduledContent: EntryProps[];
  recentlyPublishedContent: EntryProps[];
  needsUpdateContent: EntryProps[];
  contentTypeChartData: {
    contentTypeData: Array<{ date: string; [key: string]: string | number }>;
    contentTypes: string[];
  };
  authorChartData: {
    authorData: Array<{ date: string; [key: string]: string | number }>;
    authors: string[];
  };
}

// Add before the Home component
const cache = {
  users: new Map<string, CachedData<string>>(),
  contentTypes: new Map<string, CachedData<any>>(),
};

// Helper functions for dashboard data caching
const saveDashboardDataToCache = (data: DashboardData) => {
  try {
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(DASHBOARD_CACHE_TIMESTAMP_KEY, Date.now().toString());
  } catch (error) {
    console.warn('Failed to save dashboard data to cache:', error);
  }
};

const loadDashboardDataFromCache = (): { data: DashboardData | null; isValid: boolean } => {
  try {
    const cachedData = localStorage.getItem(DASHBOARD_CACHE_KEY);
    const cacheTimestamp = localStorage.getItem(DASHBOARD_CACHE_TIMESTAMP_KEY);
    
    if (!cachedData || !cacheTimestamp) {
      return { data: null, isValid: false };
    }
    
    const timestamp = parseInt(cacheTimestamp, 10);
    const isValid = Date.now() - timestamp < CACHE_DURATION;
    
    if (!isValid) {
      clearDashboardCache();
      return { data: null, isValid: false };
    }
    
    const data = JSON.parse(cachedData) as DashboardData;
    return { data, isValid: true };
  } catch (error) {
    console.warn('Failed to load dashboard data from cache:', error);
    clearDashboardCache();
    return { data: null, isValid: false };
  }
};

const clearDashboardCache = () => {
  try {
    localStorage.removeItem(DASHBOARD_CACHE_KEY);
    localStorage.removeItem(DASHBOARD_CACHE_TIMESTAMP_KEY);
  } catch (error) {
    console.warn('Failed to clear dashboard cache:', error);
  }
};

interface DashboardAppInstallationParameters {
  trackedContentTypes: string[];
  needsUpdateMonths: number;
  defaultTimeRange: 'all' | 'year' | '6months';
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
  const [hasLoadedData, setHasLoadedData] = useState<boolean>(false);
  const [forceRefresh, setForceRefresh] = useState<boolean>(false);
  const [configLoaded, setConfigLoaded] = useState<boolean>(false);

  // Add loading timer state
  const [loadingTime, setLoadingTime] = useState<number>(0);
  const loadingTimerRef = useRef<NodeJS.Timeout>();

  // Effect to load app installation parameters
  useEffect(() => {
    const loadAppParameters = async () => {
      try {
        // Try to get parameters from localStorage first
        const storedConfig = localStorage.getItem('contentDashboardConfig');
        if (storedConfig) {
          const parsedConfig = JSON.parse(storedConfig) as DashboardAppInstallationParameters;
          setTrackedContentTypes(parsedConfig.trackedContentTypes || []);
          setNeedsUpdateMonths(parsedConfig.needsUpdateMonths || 6);
          setRecentlyPublishedDays(parsedConfig.recentlyPublishedDays || 7);
          setShowUpcomingReleases(parsedConfig.showUpcomingReleases ?? true);
          setTimeToPublishDays(parsedConfig.timeToPublishDays || 30);
          setDefaultTimeRange(parsedConfig.defaultTimeRange || 'year');
          setConfigLoaded(true);
          return;
        }

        // If not in localStorage, use default values
        setTrackedContentTypes([]);
        setNeedsUpdateMonths(6);
        setRecentlyPublishedDays(7);
        setShowUpcomingReleases(true);
        setTimeToPublishDays(30);
        setDefaultTimeRange('year');
        setConfigLoaded(true);
      } catch (error) {
        console.error('Error loading app parameters:', error);
        // Use defaults if loading fails
        setTrackedContentTypes([]);
        setNeedsUpdateMonths(6);
        setRecentlyPublishedDays(7);
        setShowUpcomingReleases(true);
        setTimeToPublishDays(30);
        setDefaultTimeRange('year');
        setConfigLoaded(true);
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

  // Cache for all users in the space to avoid repeated API calls
  const [allUsersCache, setAllUsersCache] = useState<Map<string, { data: any[], timestamp: number }>>(new Map());

  // Optimized getUserFullName function that fetches all users once and caches them
  const getUserFullName = useCallback(async (userId: string): Promise<string> => {
    // Check individual user cache first
    const cachedUser = cache.users.get(userId);
    if (cachedUser && Date.now() - cachedUser.timestamp < CACHE_DURATION) {
      // Update component state cache
      setUserCache(prev => ({
        ...prev,
        [userId]: cachedUser.data
      }));
      return cachedUser.data;
    }

    // Check if we have cached all users for this space
    const spaceKey = sdk.ids.space;
    const cachedAllUsers = allUsersCache.get(spaceKey);
    
    let allUsers: any[];
    
    if (cachedAllUsers && Date.now() - cachedAllUsers.timestamp < CACHE_DURATION) {
      // Use cached users
      allUsers = cachedAllUsers.data;
    } else {
      // Fetch all users only once and cache them
      try {
        const usersResponse = await cma.user.getManyForSpace({
          spaceId: sdk.ids.space
        });
        allUsers = usersResponse.items;
        
        // Cache all users for this space
        setAllUsersCache(prev => new Map(prev.set(spaceKey, {
          data: allUsers,
          timestamp: Date.now()
        })));
        
        // Cache each individual user
        allUsers.forEach(user => {
          const fullName = user.firstName && user.lastName 
            ? `${user.firstName} ${user.lastName}`
            : user.email || user.sys.id;
          
          cache.users.set(user.sys.id, {
            data: fullName,
            timestamp: Date.now()
          });
        });
      } catch (error) {
        console.error(`Error fetching users for space ${sdk.ids.space}:`, error);
        return userId;
      }
    }

    // Find the specific user
    const user = allUsers.find(u => u.sys.id === userId);
    if (!user) {
      // Cache the "not found" result to avoid repeated lookups
      cache.users.set(userId, {
        data: userId,
        timestamp: Date.now()
      });
      return userId;
    }

    const fullName = user.firstName && user.lastName 
      ? `${user.firstName} ${user.lastName}`
      : user.email || userId;

    // Update component state cache
    setUserCache(prev => ({
      ...prev,
      [userId]: fullName
    }));

    return fullName;
  }, [cma, sdk.ids.space, allUsersCache]);

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
    contentTypes: string[];
  }>({ contentTypeData: [], contentTypes: [] });

  // Add new state for author data
  const [authorChartData, setAuthorChartData] = useState<{
    authorData: Array<{ date: string; [key: string]: string | number }>;
    authors: string[];
  }>({ authorData: [], authors: [] });

  // Check for cached data on component mount
  useEffect(() => {
    const { data: cachedData, isValid } = loadDashboardDataFromCache();
    if (isValid && cachedData) {
      setHasLoadedData(true);
    }
  }, []);

  // Removed periodic cache validation to prevent excessive API calls that cause 429 errors
  // The cache will still be validated when the component mounts or when user manually refreshes

  useEffect(() => {
    // Don't run if config hasn't been loaded yet
    if (!configLoaded) {
      return;
    }
    
    const fetchContentStats = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Check if we should use cached data
        if (!forceRefresh && hasLoadedData) {
          const { data: cachedData, isValid } = loadDashboardDataFromCache();
          if (isValid && cachedData) {
            // Load data from cache
            setStats(cachedData.stats);
            setChartData(cachedData.chartData);
            setScheduledReleases(cachedData.scheduledReleases);
            setUserCache(cachedData.userCache);
            setScheduledContent(cachedData.scheduledContent);
            setRecentlyPublishedContent(cachedData.recentlyPublishedContent);
            setNeedsUpdateContent(cachedData.needsUpdateContent);
            setContentTypeChartData(cachedData.contentTypeChartData);
            setAuthorChartData(cachedData.authorChartData);
            setIsLoading(false);
            return;
          } else {
            // Cache is invalid, reset hasLoadedData to force fresh fetch
            console.log('Cache is invalid, forcing fresh data fetch...');
            setHasLoadedData(false);
          }
        }
        
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
            { monthsToShow: null } // Fetch all historical data
          ),
          fetchContentTypeChartData(
            cma,
            sdk.ids.space,
            sdk.ids.environment,
            { 
              trackedContentTypes,
              monthsToShow: null // Fetch all historical data
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
        setScheduledReleases(releasesData);
        setScheduledContent(scheduled);
        setRecentlyPublishedContent(recentlyPublishedResponse.items);
        setNeedsUpdateContent(needsUpdateResponse.items);
        
        // Update content type chart data
        setContentTypeChartData({
          contentTypeData: contentTypeDataFromApi.contentTypeData,
          contentTypes: contentTypeDataFromApi.contentTypes
        });
        
        // Fetch comprehensive author data using the same approach as the main chart
        // This ensures author chart matches the total published content numbers
        const currentDate = new Date();
        const startDate = new Date(currentDate);
        startDate.setMonth(currentDate.getMonth() - 1200); // Get all historical data (100 years back)
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);

        // Fetch all new content for author analysis (same as main chart)
        const fetchAllNewContentForAuthors = async () => {
          const allEntries = [];
          let skip = 0;
          const limit = 1000;
          
          while (true) {
            const response = await cma.entry.getMany({
              spaceId: sdk.ids.space,
              environmentId: sdk.ids.environment,
              query: {
                'sys.firstPublishedAt[gte]': startDate.toISOString(),
                'sys.publishedAt[exists]': true,
                skip,
                limit,
                order: 'sys.firstPublishedAt'
              }
            });
            
            allEntries.push(...response.items);
            
            if (response.items.length < limit) {
              break;
            }
            
            skip += limit;
          }
          
          return allEntries;
        };

        // Fetch the comprehensive dataset
        const allNewContentEntries = await fetchAllNewContentForAuthors();

        const authorData = new Map<string, Map<string, number>>();
        const authors = new Set<string>();

        // Helper function to process entries by date and author
        const processEntriesByAuthor = async (entries: any[], dataMap: Map<string, Map<string, number>>) => {
          for (const entry of entries) {
            // For new content: use firstPublishedAt
            const date = new Date(entry.sys.firstPublishedAt || entry.sys.publishedAt);
            
            const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            // Skip if the entry doesn't have the required date
            if (!date) continue;

            // Always use createdBy to show who originally created the content
            const authorId = entry.sys.createdBy?.sys.id;

            if (!authorId) continue;
            
            // Get author name from cache or resolve it
            let authorName = userCache[authorId];
            if (!authorName && authorId !== 'Unknown') {
              authorName = await getUserFullName(authorId);
            }
            authorName = authorName || authorId;
            authors.add(authorName);

            if (!dataMap.has(monthYear)) {
              dataMap.set(monthYear, new Map());
            }
            const monthData = dataMap.get(monthYear)!;
            monthData.set(authorName, (monthData.get(authorName) || 0) + 1);
          }
        };

        // Process the comprehensive dataset
        await processEntriesByAuthor(allNewContentEntries, authorData);

        // Convert the Maps to the required format
        const convertMapToChartData = (dataMap: Map<string, Map<string, number>>) => {
          // Find the earliest and latest dates from the data
          const allDataDates = Array.from(dataMap.keys()).sort();
          if (allDataDates.length === 0) {
            return [];
          }

          // Parse the earliest date more carefully
          const [earliestYear, earliestMonth] = allDataDates[0].split('-').map(Number);
          const currentDate = new Date();
          const dates = new Set<string>();

          // Generate all months from earliest to current
          let year = earliestYear;
          let month = earliestMonth;
          
          while (year < currentDate.getFullYear() || (year === currentDate.getFullYear() && month <= currentDate.getMonth() + 1)) {
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;
            dates.add(monthKey);
            
            month++;
            if (month > 12) {
              month = 1;
              year++;
            }
          }

          const finalDates = Array.from(dates).sort();

          // Convert to array and sort
          return finalDates.map(date => ({
            date: `${date}-01`, // Convert to full date format
            ...Object.fromEntries(
              Array.from(authors).map(author => [
                author,
                (dataMap.get(date)?.get(author) || 0)
              ])
            )
          }));
        };

        const finalAuthorChartData = {
          authorData: convertMapToChartData(authorData),
          authors: Array.from(authors)
        };

        setAuthorChartData(finalAuthorChartData);
        
        // Save all data to cache
        const dashboardData: DashboardData = {
          stats: updatedStats,
          chartData: chartDataFromApi.newContent,
          scheduledReleases: releasesData,
          userCache,
          scheduledContent: scheduled,
          recentlyPublishedContent: recentlyPublishedResponse.items,
          needsUpdateContent: needsUpdateResponse.items,
          contentTypeChartData: {
            contentTypeData: contentTypeDataFromApi.contentTypeData,
            contentTypes: contentTypeDataFromApi.contentTypes
          },
          authorChartData: finalAuthorChartData
        };
        
        saveDashboardDataToCache(dashboardData);
        setHasLoadedData(true);
        setForceRefresh(false);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching content stats:', error);
        setError('Failed to load content data');
        setIsLoading(false);
        
        // Try to load from cache as fallback, even if expired
        const { data: cachedData } = loadDashboardDataFromCache();
        if (cachedData) {
          console.log('Using expired cache data as fallback...');
          setStats(cachedData.stats);
          setChartData(cachedData.chartData);
          setScheduledReleases(cachedData.scheduledReleases);
          setUserCache(cachedData.userCache);
          setScheduledContent(cachedData.scheduledContent);
          setRecentlyPublishedContent(cachedData.recentlyPublishedContent);
          setNeedsUpdateContent(cachedData.needsUpdateContent);
          setContentTypeChartData(cachedData.contentTypeChartData);
          setAuthorChartData(cachedData.authorChartData);
          setError('Using cached data - click refresh to update');
        }
      }
    };

    fetchContentStats();
  }, [cma, sdk.ids.space, sdk.ids.environment, trackedContentTypes, needsUpdateMonths, recentlyPublishedDays, timeToPublishDays, forceRefresh, hasLoadedData, configLoaded, getUserFullName]);

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
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-bold">Content Dashboard</h1>
            {error && error.includes('cached data') && (
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                Using cached data
              </span>
            )}
          </div>
          <button 
            onClick={() => {
              clearDashboardCache();
              setForceRefresh(true);
            }}
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
            </div>
          </div>
        ) : error ? (
          <div className="bg-destructive/10 p-4 rounded-md">
            <p className="text-destructive">{error}</p>
            <p className="text-sm mt-2">
              {error.includes('cached data') 
                ? 'The dashboard is showing cached data. Click refresh to load the latest information.'
                : 'There was an error loading the content data. Please try refreshing the page.'
              }
            </p>
            {error.includes('cached data') && (
              <button 
                onClick={() => {
                  clearDashboardCache();
                  setForceRefresh(true);
                  setError(null);
                }}
                className="mt-3 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
              >
                Refresh Now
              </button>
            )}
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
                contentTypeData={contentTypeChartData.contentTypeData}
                contentTypes={contentTypeChartData.contentTypes}
                authorData={authorChartData.authorData}
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

export default Home;
