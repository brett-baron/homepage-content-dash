import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import ContentChart from "./content-chart"
import ContentTypeChart from "./content-type-chart"

type TimeRange = 'all' | 'year' | '6months';
type ContentType = 'new' | 'updated';

interface ContentTrendsTabsProps {
  chartData: Array<{ date: string; count: number; percentChange?: number }>;
  updatedChartData: Array<{ date: string; count: number; percentChange?: number }>;
  contentTypeData: Array<{ date: string; [key: string]: string | number }>;
  contentTypeUpdatedData: Array<{ date: string; [key: string]: string | number }>;
  contentTypes: string[];
  authorData: Array<{ date: string; [key: string]: string | number }>;
  authorUpdatedData: Array<{ date: string; [key: string]: string | number }>;
  authors: string[];
}

export default function ContentTrendsTabs({
  chartData,
  updatedChartData,
  contentTypeData,
  contentTypeUpdatedData,
  contentTypes,
  authorData,
  authorUpdatedData,
  authors
}: ContentTrendsTabsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('year');
  const [contentView, setContentView] = useState<ContentType>('new');

  return (
    <div className="w-full rounded-xl bg-white p-6 shadow-sm">
      <Tabs defaultValue="overall" className="w-full">
        <div className="mb-6 flex justify-between items-center">
          <TabsList className="bg-muted h-10">
            <TabsTrigger value="overall">Overall Trends</TabsTrigger>
            <TabsTrigger value="by-type">By Content Type</TabsTrigger>
            <TabsTrigger value="by-author">By Author</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-4">
            {/* Content type selector - shown for both tabs */}
            <Select value={contentView} onValueChange={(value) => setContentView(value as ContentType)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Content type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>View</SelectLabel>
                  <SelectItem value="new">New Content</SelectItem>
                  <SelectItem value="updated">New or Updated</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            
            {/* Time range selector - shown for both tabs */}
            <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Select time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Time Range</SelectLabel>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="year">Past Year</SelectItem>
                  <SelectItem value="6months">Last 6 Months</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="overall" className="mt-0">
          <ContentChart
            data={chartData}
            updatedData={updatedChartData}
            selectedTimeRange={timeRange}
            selectedContentType={contentView}
          />
        </TabsContent>

        <TabsContent value="by-type" className="mt-0">
          <ContentTypeChart
            data={contentTypeData}
            updatedData={contentTypeUpdatedData}
            contentTypes={contentTypes}
            selectedTimeRange={timeRange}
            selectedContentType={contentView}
          />
        </TabsContent>

        <TabsContent value="by-author" className="mt-0">
          <ContentTypeChart
            data={authorData}
            updatedData={authorUpdatedData}
            contentTypes={authors}
            selectedTimeRange={timeRange}
            selectedContentType={contentView}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
} 