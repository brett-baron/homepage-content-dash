import React from 'react';
import { HomeAppSDK } from '@contentful/app-sdk';
import { /* useCMA, */ useSDK } from '@contentful/react-apps-toolkit';
import { CalendarDays, Clock, Edit, FileText } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ContentTable } from "@/components/content-table"
import { WorkflowStageChart } from "@/components/workflow-stage-chart"

// Sample data for upcoming releases
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

const Home = () => {
  const sdk = useSDK<HomeAppSDK>();
  /*
     To use the cma, inject it as follows.
     If it is not needed, you can remove the next line.
  */
  // const cma = useCMA();

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
              <div className="text-2xl font-bold">87</div>
              <p className="text-xs text-muted-foreground">+4% from last month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">24</div>
              <p className="text-xs text-muted-foreground">For the next 30 days</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recently Published</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">12</div>
              <p className="text-xs text-muted-foreground">In the last 7 days</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Needs Update</CardTitle>
              <Edit className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">18</div>
              <p className="text-xs text-muted-foreground">Content older than 6 months</p>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Releases Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Upcoming Releases</h2>
          <ContentTable
            title="Content Scheduled for Release"
            description="High-priority content scheduled for imminent release"
            data={upcomingReleases}
            showStage={true}
          />
        </div>

        <Tabs defaultValue="scheduled" className="space-y-4">
          <TabsList>
            <TabsTrigger value="scheduled">Scheduled Content</TabsTrigger>
            <TabsTrigger value="published">Recently Published</TabsTrigger>
            <TabsTrigger value="update">Needs Update</TabsTrigger>
          </TabsList>
          <TabsContent value="scheduled" className="space-y-4">
            <ContentTable
              title="Upcoming Scheduled Content"
              description="Content scheduled for publication in the next 30 days."
              data={upcomingContent}
              showStage={true}
            />
          </TabsContent>
          <TabsContent value="published" className="space-y-4">
            <ContentTable
              title="Recently Published Content"
              description="Content published in the last 30 days."
              data={recentlyPublishedContent}
              showStage={false}
            />
          </TabsContent>
          <TabsContent value="update" className="space-y-4">
            <ContentTable
              title="Content Needing Updates"
              description="Content that was published more than 6 months ago and needs review."
              data={needsUpdateContent}
              showStage={false}
            />
          </TabsContent>
        </Tabs>

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
