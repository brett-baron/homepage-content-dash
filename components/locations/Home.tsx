import React, { useEffect, useState } from 'react';
import { HomeAppSDK } from '@contentful/app-sdk';
import { useCMA, useSDK } from '@contentful/react-apps-toolkit';
import { CalendarDays, Clock, Edit, FileText, GitBranchPlus } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ContentTable } from "@/components/content-table"
import ContentChart from "@/components/content-chart"
import { WorkflowStageChart } from "@/components/workflow-stage-chart"
import { getContentStats, generateChartData, generateUpdatedChartData, getContentStatsPaginated, fetchEntriesByType, fetchChartData } from '../../utils/contentful';
import { Environment, CollectionProp, EntryProps, ReleaseProps, User } from 'contentful-management';
import { ContentEntryTabs } from '@/components/ContentEntryTabs';
import { AppInstallationParameters } from './ConfigScreen';

// Sample data for upcoming releases
const contentData = [
  { date: "2023-01-01", count: 4 },
  { date: "2023-02-01", count: 7 },
  { date: "2023-03-01", count: 5 },
  { date: "2023-04-01", count: 10 },
  { date: "2023-05-01", count: 8 },
  { date: "2023-06-01", count: 12 },
  { date: "2023-07-01", count: 15 },
  { date: "2023-08-01", count: 13 },
  { date: "2023-09-01", count: 18 },
  { date: "2023-10-01", count: 20 },
  { date: "2023-11-01", count: 22 },
  { date: "2023-12-01", count: 25 },
]

const upcomingReleases = [
  {
    id: "r1",
    title: "Q2 Marketing Campaign Launch",
    author: "Marketing Team",
    status: "Scheduled",
    workflow: "Campaign",
    stage: "Ready to Launch",
    date: "2025-04-18",
  },
  {
    id: "r2",
    title: "New Product Announcement",
    author: "Product Team",
    status: "Scheduled",
    workflow: "Press Release",
    stage: "Final Approval",
    date: "2025-04-19",
  },
  {
    id: "r3",
    title: "Website Redesign Launch",
    author: "Design Team",
    status: "Scheduled",
    workflow: "Website",
    stage: "Pre-launch Testing",
    date: "2025-04-21",
  },
]

// Sample data with workflow stages
const upcomingContent = [
  {
    id: "1",
    title: "2024 Industry Trends Report",
    author: "Alex Johnson",
    status: "Scheduled",
    workflow: "Blog Post",
    stage: "Ready to Publish",
    date: "2025-04-20",
  },
  {
    id: "2",
    title: "Product Feature Announcement",
    author: "Sarah Miller",
    status: "Scheduled",
    workflow: "Press Release",
    stage: "Final Review",
    date: "2025-04-22",
  },
  {
    id: "3",
    title: "Customer Success Story: XYZ Corp",
    author: "Michael Brown",
    status: "Scheduled",
    workflow: "Case Study",
    stage: "Approved",
    date: "2025-04-25",
  },
  {
    id: "4",
    title: "Quarterly Newsletter",
    author: "Emily Davis",
    status: "Scheduled",
    workflow: "Newsletter",
    stage: "Ready to Publish",
    date: "2025-04-30",
  },
  {
    id: "5",
    title: "Upcoming Webinar Promotion",
    author: "David Wilson",
    status: "Scheduled",
    workflow: "Social Media",
    stage: "Scheduled",
    date: "2025-05-05",
  },
]

const recentlyPublishedContent = [
  {
    id: "6",
    title: "How to Optimize Your Content Strategy",
    author: "Jessica Lee",
    status: "Published",
    workflow: "Blog Post",
    date: "2025-04-15",
  },
  {
    id: "7",
    title: "New Partnership Announcement",
    author: "Robert Chen",
    status: "Published",
    workflow: "Press Release",
    date: "2025-04-12",
  },
  {
    id: "8",
    title: "Product Update: Version 2.5",
    author: "Thomas Wright",
    status: "Published",
    workflow: "Release Notes",
    date: "2025-04-10",
  },
  {
    id: "9",
    title: "5 Ways to Improve Team Productivity",
    author: "Amanda Garcia",
    status: "Published",
    workflow: "Blog Post",
    date: "2025-04-08",
  },
  {
    id: "10",
    title: "Customer Spotlight: ABC Inc.",
    author: "Kevin Taylor",
    status: "Published",
    workflow: "Case Study",
    date: "2025-04-05",
  },
]

const needsUpdateContent = [
  {
    id: "11",
    title: "Complete Guide to Our Platform",
    author: "Nicole Adams",
    status: "Published",
    workflow: "Documentation",
    date: "2024-09-15",
  },
  {
    id: "12",
    title: "Industry Benchmark Report 2024",
    author: "Brian Johnson",
    status: "Published",
    workflow: "White Paper",
    date: "2024-08-22",
  },
  {
    id: "13",
    title: "Getting Started Tutorial",
    author: "Lisa Wang",
    status: "Published",
    workflow: "Documentation",
    date: "2024-07-30",
  },
  {
    id: "14",
    title: "Pricing and Plans Overview",
    author: "Mark Robinson",
    status: "Published",
    workflow: "Website Content",
    date: "2024-06-18",
  },
  {
    id: "15",
    title: "Company History and Mission",
    author: "Patricia Scott",
    status: "Published",
    workflow: "About Page",
    date: "2024-05-10",
  },
]

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

// Update the ContentTable component props to match the new structure
interface ContentTableProps {
  data: ScheduledRelease[];
  showItemCount?: boolean;
  showUpdatedAt?: boolean;
  showUpdatedBy?: boolean;
}

interface AppConfig {
  excludedContentTypes: string[];
  needsUpdateMonths: number;
  recentlyPublishedDays: number;
}

interface ScheduledAction {
  sys: {
    type: string;
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  scheduledFor: {
    datetime: string;
    timezone: string;
  };
  action: string;
  entity: {
    sys: {
      type: string;
      linkType: string;
      id: string;
    };
  };
  release?: {
    entities: {
      items: Array<{
        sys: {
          id: string;
          type: string;
        };
      }>;
    };
  };
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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Function to get user's full name
  const getUserFullName = async (userId: string): Promise<string> => {
    // Check cache first
    if (userCache[userId]) {
      return userCache[userId];
    }

    try {
      // Fetch user data using getForSpace method
      const user = await cma.user.getForSpace({
        spaceId: sdk.ids.space,
        userId
      });
      
      const fullName = user.firstName && user.lastName 
        ? `${user.firstName} ${user.lastName}`
        : user.email || userId;

      // Update cache
      setUserCache(prev => ({
        ...prev,
        [userId]: fullName
      }));

      return fullName;
    } catch (error) {
      console.error(`Error fetching user data for ${userId}:`, error);
      return userId; // Fallback to ID if fetch fails
    }
  };

  // Separate useEffect to fetch app installation parameters
  useEffect(() => {
    // Function to get app installation parameters
    const fetchAppInstallationParameters = async () => {
      try {
        // For simplicity, we'll get the configuration directly from localStorage
        // In a real app, you'd implement proper API calls to your backend service
        const storedConfig = localStorage.getItem('contentDashboardConfig');
        
        if (storedConfig) {
          try {
            const parsedConfig = JSON.parse(storedConfig) as AppInstallationParameters;
            
            // Set the excluded content types
            if (parsedConfig.excludedContentTypes && Array.isArray(parsedConfig.excludedContentTypes)) {
              console.log('Loaded excludedContentTypes from localStorage:', parsedConfig.excludedContentTypes);
              setExcludedContentTypes(parsedConfig.excludedContentTypes);
            }
            
            // Set the needs update months threshold
            if (parsedConfig.needsUpdateMonths && parsedConfig.needsUpdateMonths > 0) {
              console.log('Loaded needsUpdateMonths from localStorage:', parsedConfig.needsUpdateMonths);
              setNeedsUpdateMonths(parsedConfig.needsUpdateMonths);
            }
            
            // Set the recently published days threshold
            if (parsedConfig.recentlyPublishedDays && parsedConfig.recentlyPublishedDays > 0) {
              console.log('Loaded recentlyPublishedDays from localStorage:', parsedConfig.recentlyPublishedDays);
              setRecentlyPublishedDays(parsedConfig.recentlyPublishedDays);
            }
            
            return;
          } catch (e) {
            console.error('Error parsing stored config:', e);
          }
        }
        
        // If we couldn't get a configuration from localStorage, use the default values
        // BUT we'll check if they exist first by fetching content types
        try {
          const contentTypesResponse = await cma.contentType.getMany({
            spaceId: sdk.ids.space,
            environmentId: sdk.ids.environment
          });
          
          const availableContentTypeIds = contentTypesResponse.items.map(ct => ct.sys.id);
          console.log('Available content types for defaults:', availableContentTypeIds);
          
          // Filter the default excluded types to only include ones that exist
          const defaultExcludedBase = ['page', 'settings', 'navigation', 'siteConfig'];
          const defaultExcluded = defaultExcludedBase.filter(id => 
            availableContentTypeIds.includes(id)
          );
          
          if (defaultExcluded.length !== defaultExcludedBase.length) {
            console.warn('Some default excluded content types do not exist in this space:', 
              defaultExcludedBase.filter(id => !availableContentTypeIds.includes(id))
            );
          }
          
          setExcludedContentTypes(defaultExcluded);
          console.log('Using filtered default excluded content types:', defaultExcluded);
          
          // For demo purposes, save these default values to localStorage
          localStorage.setItem('contentDashboardConfig', JSON.stringify({ 
            excludedContentTypes: defaultExcluded,
            needsUpdateMonths: 6,
            recentlyPublishedDays: 7
          }));
        } catch (error) {
          console.error('Error fetching content types for defaults:', error);
          // Fallback to empty array if we can't fetch content types
          setExcludedContentTypes([]);
        }
      } catch (error) {
        console.error('Error setting up excluded content types:', error);
        // Use empty array as fallback
        setExcludedContentTypes([]);
      }
    };

    fetchAppInstallationParameters();
  }, [cma, sdk.ids.space, sdk.ids.environment]);

  useEffect(() => {
    const fetchContentStats = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const space = await cma.space.get({ spaceId: sdk.ids.space });
        const environment = await cma.environment.get({
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment
        });

        // Fetch scheduled actions for releases
        const scheduledActions = await cma.scheduledActions.getMany({
          spaceId: sdk.ids.space,
          query: {
            'environment.sys.id': sdk.ids.environment,
            'sys.status[in]': 'scheduled',
            'order': 'scheduledFor.datetime',
            'limit': 500
          }
        });

        // Process releases (unchanged from original code)
        const releaseIds = scheduledActions.items
          .filter(action => action.entity.sys.linkType === 'Release')
          .map(action => action.entity.sys.id);

        let releasesData: ScheduledRelease[] = [];
        if (releaseIds.length > 0) {
          try {
            // Fetch each release individually
            const releasesPromises = releaseIds.map(releaseId => 
              cma.release.get({
                spaceId: sdk.ids.space,
                environmentId: sdk.ids.environment,
                releaseId
              })
            );
            
            const releases = await Promise.all(releasesPromises);
            
            // Attach release data to actions
            scheduledActions.items = scheduledActions.items.map(action => {
              if (action.entity.sys.linkType === 'Release') {
                const release = releases.find(r => r.sys.id === action.entity.sys.id);
                if (release) {
                  return {
                    ...action,
                    release: {
                      entities: {
                        items: release.entities.items
                      }
                    }
                  };
                }
              }
              return action;
            });

            // Get unique user IDs from releases
            const userIds = new Set(releases.map(release => release.sys.updatedBy.sys.id));
            
            // Fetch user data in parallel
            const userPromises = Array.from(userIds).map(userId => getUserFullName(userId));
            const userNames = await Promise.all(userPromises);
            
            // Create a map of user IDs to names
            const userMap = Object.fromEntries(
              Array.from(userIds).map((id, index) => [id, userNames[index]])
            );
            
            // Combine release data with scheduled action data and user names
            releasesData = releases.map(release => {
              const scheduledAction = scheduledActions.items.find(
                action => action.entity.sys.id === release.sys.id
              );
              return {
                id: release.sys.id,
                title: release.title,
                scheduledDateTime: scheduledAction?.scheduledFor.datetime || new Date().toISOString(),
                status: 'Scheduled',
                itemCount: release.entities.items.length,
                updatedAt: release.sys.updatedAt,
                updatedBy: userMap[release.sys.updatedBy.sys.id] || release.sys.updatedBy.sys.id
              };
            });

            // Sort by scheduled date
            releasesData.sort((a, b) => new Date(a.scheduledDateTime).getTime() - new Date(b.scheduledDateTime).getTime());
          } catch (error) {
            console.error('Error fetching releases:', error);
          }
        }
        
        setScheduledReleases(releasesData);

        // Use the new paginated content stats function
        const contentStats = await getContentStatsPaginated(
          cma,
          sdk.ids.space,
          sdk.ids.environment,
          scheduledActions.items,
          recentlyPublishedDays,
          needsUpdateMonths,
          excludedContentTypes
        );
        
        setStats(contentStats);
        
        // Fetch chart data directly from API
        const chartDataFromApi = await fetchChartData(
          cma,
          sdk.ids.space,
          sdk.ids.environment,
          excludedContentTypes
        );
        setChartData(chartDataFromApi);
        
        // For updated data, we still need to fetch it
        // Note: We could implement a similar function to fetchChartData for updates
        // But for now using the sample data as a placeholder
        setUpdatedChartData(contentData);

        // For content tabs, fetch each category with pagination
        // 1. Scheduled content - from scheduled actions
        const now = new Date();
        const scheduledEntryIds = new Set<string>();
        
        scheduledActions.items.forEach(action => {
          if (action.sys.status === 'scheduled' && 
              new Date(action.scheduledFor.datetime) > now &&
              action.action === 'publish') {
            
            if (action.entity.sys.linkType === 'Entry') {
              scheduledEntryIds.add(action.entity.sys.id);
            } else if (action.entity.sys.linkType === 'Release') {
              const releaseEntities = (action as ScheduledAction).release?.entities?.items || [];
              releaseEntities.forEach((entity: { sys?: { id?: string } }) => {
                if (entity.sys?.id) {
                  scheduledEntryIds.add(entity.sys.id);
                }
              });
            }
          }
        });
        
        // If we have scheduled entries, fetch them
        let scheduled: EntryProps[] = [];
        if (scheduledEntryIds.size > 0) {
          // Fetch in batches of 100 if there are many
          const idArray = Array.from(scheduledEntryIds);
          const batchSize = 100;
          let allScheduled: EntryProps[] = [];
          
          for (let i = 0; i < idArray.length; i += batchSize) {
            const batchIds = idArray.slice(i, i + batchSize);
            const query = {
              'sys.id[in]': batchIds.join(','),
              limit: batchSize
            };
            
            const response = await cma.entry.getMany({
              spaceId: sdk.ids.space,
              environmentId: sdk.ids.environment,
              query
            });
            
            allScheduled = [...allScheduled, ...response.items];
          }
          
          scheduled = allScheduled;
        }
        
        // 2. Recently published content
        const recentlyPublishedDate = new Date();
        recentlyPublishedDate.setDate(recentlyPublishedDate.getDate() - recentlyPublishedDays);
        
        const recentlyPublishedResponse = await fetchEntriesByType(
          cma,
          sdk.ids.space,
          sdk.ids.environment,
          {
            'sys.publishedAt[gte]': recentlyPublishedDate.toISOString(),
            'order': '-sys.publishedAt',
            'limit': 100
          }
        );
        
        // 3. Needs update content
        const needsUpdateDate = new Date();
        needsUpdateDate.setMonth(needsUpdateDate.getMonth() - needsUpdateMonths);
        
        const needsUpdateResponse = await fetchEntriesByType(
          cma,
          sdk.ids.space,
          sdk.ids.environment,
          {
            'sys.publishedAt[exists]': true,
            'sys.updatedAt[lte]': needsUpdateDate.toISOString(),
            'order': 'sys.updatedAt',
            'limit': 100
          }
        );

        // 4. Orphaned content (this requires more complex logic)
        // For scalability, we'll limit this to the first 100 entries
        // A full implementation would require server-side processing
        const orphanedResponse = await fetchEntriesByType(
          cma,
          sdk.ids.space,
          sdk.ids.environment,
          {
            'sys.publishedAt[exists]': true,
            'limit': 100,
            'order': '-sys.updatedAt'
          }
        );
        
        // Filter out content types that should be excluded
        const filteredOrphaned = orphanedResponse.items.filter(entry => 
          !(entry.sys.contentType && 
            excludedContentTypes.includes(entry.sys.contentType.sys.id))
        );
        
        // Note: This isn't truly finding orphaned content in a scalable way
        // For a real implementation with millions of entries, this would need
        // server-side processing or a separate indexing service
        
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
  }, [cma, sdk.ids.space, sdk.ids.environment, excludedContentTypes, needsUpdateMonths, recentlyPublishedDays]);

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
        <h1 className="text-2xl font-bold">Content Dashboard</h1>
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
                        {stats.percentChange >= 0 ? '+' : ''}{stats.percentChange.toFixed(1)}% publishing {stats.percentChange >= 0 ? 'increase' : 'decrease'} from last month
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
                  <GitBranchPlus className="h-8 w-8 text-primary" />
                </div>
                <CardHeader className="pb-1 pt-2 px-3 pr-14">
                  <CardTitle className="text-sm font-semibold">Orphaned Content</CardTitle>
                </CardHeader>
                <CardContent className="pb-3 pt-0 px-3 pr-14">
                  <div className="text-3xl font-bold">{orphanedContent.length}</div>
                  <p className="text-sm text-muted-foreground mt-1">Entries with no references</p>
                </CardContent>
              </Card>
            </div>
            <ContentChart
              data={chartData.length > 0 ? chartData : contentData}
              updatedData={updatedChartData.length > 0 ? updatedChartData : contentData}
              title="Content Trends"
            />
            {/* Upcoming Releases Section */}
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
            />

            {/* <Card>
              <CardHeader>
                <CardTitle>Workflow & Stage Distribution</CardTitle>
                <CardDescription>Content items by workflow and stage</CardDescription>
              </CardHeader>
              <CardContent>
                <WorkflowStageChart />
              </CardContent>
            </Card> */}
          </>
        )}
      </main>
    </div>
  )
};

export default Home;
