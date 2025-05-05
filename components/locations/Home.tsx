import React, { useEffect, useState } from 'react';
import { HomeAppSDK } from '@contentful/app-sdk';
import { useCMA, useSDK } from '@contentful/react-apps-toolkit';
import { CalendarDays, Clock, Edit, FileText } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ContentTable } from "@/components/content-table"
import ContentChart from "@/components/content-chart"
import { WorkflowStageChart } from "@/components/workflow-stage-chart"
import { getContentStats, generateChartData } from '../../utils/contentful';
import { Environment, CollectionProp, EntryProps, ReleaseProps, User } from 'contentful-management';
import { ContentEntryTabs } from '@/components/ContentEntryTabs';

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
  const [scheduledReleases, setScheduledReleases] = useState<ScheduledRelease[]>([]);
  const [userCache, setUserCache] = useState<UserCache>({});
  
  // New state for content entries
  const [scheduledContent, setScheduledContent] = useState<EntryProps[]>([]);
  const [recentlyPublishedContent, setRecentlyPublishedContent] = useState<EntryProps[]>([]);
  const [needsUpdateContent, setNeedsUpdateContent] = useState<EntryProps[]>([]);

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

  useEffect(() => {
    const fetchContentStats = async () => {
      try {
        console.log('Fetching content stats...');
        const space = await cma.space.get({ spaceId: sdk.ids.space });
        console.log('Space:', space.name);

        const environment = await cma.environment.get({
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment
        });
        console.log('Environment:', environment.name);

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
        console.log('Scheduled actions:', scheduledActions);

        // Extract release IDs from scheduled actions
        const releaseIds = scheduledActions.items
          .filter(action => action.entity.sys.linkType === 'Release')
          .map(action => action.entity.sys.id);

        // If we have release IDs, fetch the release details
        let releasesData: ScheduledRelease[] = [];
        if (releaseIds.length > 0) {
          try {
            // Fetch each release individually since there's no getMany method
            const releasesPromises = releaseIds.map(releaseId => 
              cma.release.get({
                spaceId: sdk.ids.space,
                environmentId: sdk.ids.environment,
                releaseId
              })
            );
            
            const releases = await Promise.all(releasesPromises);
            
            // Attach release data to the corresponding scheduled actions
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
        console.log('Releases data:', releasesData);

        // Fetch all entries with pagination
        let allEntries: EntryProps[] = [];
        let skip = 0;
        const limit = 1000; // Maximum allowed by Contentful
        
        // First request to get total count
        const initialResponse = await cma.entry.getMany({
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment,
          query: {
            limit: 1
          }
        });
        
        const totalEntries = initialResponse.total;
        console.log(`Total entries in space: ${totalEntries}`);
        
        // Fetch all entries in batches
        while (allEntries.length < totalEntries) {
          const entriesResponse = await cma.entry.getMany({
            spaceId: sdk.ids.space,
            environmentId: sdk.ids.environment,
            query: {
              skip,
              limit
            }
          });
          
          allEntries = [...allEntries, ...entriesResponse.items];
          console.log(`Fetched ${allEntries.length} of ${totalEntries} entries`);
          
          skip += limit;
          
          // Safety check to prevent infinite loops
          if (entriesResponse.items.length === 0) {
            console.warn('Received empty response despite not reaching total count');
            break;
          }
        }
        
        // Create a properly typed CollectionProp object
        const entries: CollectionProp<EntryProps> = {
          items: allEntries,
          total: allEntries.length,
          sys: { type: 'Array' },
          skip: 0,
          limit: allEntries.length
        };
        
        console.log('Total entries:', entries.items.length);
        console.log('Sample entry:', entries.items[0]);
        
        const contentStats = await getContentStats(entries, scheduledActions.items);
        console.log('Calculated stats:', contentStats);
        setStats(contentStats);
        
        // Generate chart data from entries
        const chartDataFromEntries = generateChartData(entries);
        console.log('Chart data:', chartDataFromEntries);
        setChartData(chartDataFromEntries);

        // After allEntries is populated, categorize the entries
        const now = new Date();
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);

        // Filter entries into categories
        const scheduled = allEntries.filter(entry => {
          // Check if the entry has a scheduled action in the scheduledActions array
          const matchingScheduledAction = scheduledActions.items.find(
            action => action.entity.sys.id === entry.sys.id
          );
          return matchingScheduledAction && new Date(matchingScheduledAction.scheduledFor.datetime) > now;
        });

        const recentlyPublished = allEntries.filter(entry => {
          const publishDate = entry.sys.publishedAt;
          return publishDate && new Date(publishDate) > sevenDaysAgo;
        });

        const needsUpdate = allEntries.filter(entry => {
          const updateDate = entry.sys.updatedAt;
          return updateDate && new Date(updateDate) < sixMonthsAgo;
        });

        setScheduledContent(scheduled);
        setRecentlyPublishedContent(recentlyPublished);
        setNeedsUpdateContent(needsUpdate);
      } catch (error) {
        console.error('Error fetching content stats:', error);
      }
    };

    fetchContentStats();
  }, [cma, sdk.ids.space, sdk.ids.environment]);

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

  return (
    <div className="flex min-h-screen w-full flex-col">
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <h1 className="text-2xl font-bold">Content Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Published Content</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPublished}</div>
              <p className="text-xs text-muted-foreground">
                {stats.previousMonthPublished === 0
                ? 'No content published last month'
                : (
                  <span className={stats.percentChange >= 0 ? "text-green-500" : "text-red-500"}>
                    {stats.percentChange >= 0 ? '+' : ''}{stats.percentChange.toFixed(1)}% from last month
                  </span>
                )}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.scheduledCount}</div>
              <p className="text-xs text-muted-foreground">For the next 30 days</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recently Published</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.recentlyPublishedCount}</div>
              <p className="text-xs text-muted-foreground">In the last 7 days</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Needs Update</CardTitle>
              <Edit className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.needsUpdateCount}</div>
              <p className="text-xs text-muted-foreground">Content older than 6 months</p>
            </CardContent>
          </Card>
        </div>
        <ContentChart
          data={chartData.length > 0 ? chartData : contentData}
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
          />
        </div>

        <ContentEntryTabs
          scheduledContent={scheduledContent}
          recentlyPublishedContent={recentlyPublishedContent}
          needsUpdateContent={needsUpdateContent}
          userCache={userCache}
          onResolveUser={getUserFullName}
        />

        <Card>
          <CardHeader>
            <CardTitle>Workflow & Stage Distribution</CardTitle>
            <CardDescription>Content items by workflow and stage</CardDescription>
          </CardHeader>
          <CardContent>
            <WorkflowStageChart />
          </CardContent>
        </Card>
      </main>
    </div>
  )
};

export default Home;
