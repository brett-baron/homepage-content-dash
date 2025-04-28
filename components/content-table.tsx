import { MoreHorizontal } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface ContentItem {
  id: string
  title: string
  author?: string
  status: string
  workflow?: string
  stage?: string
  date?: string
}

interface ScheduledRelease {
  id: string
  title: string
  scheduledDateTime: string
  status: string
  itemCount: number
  updatedAt: string
  updatedBy: string
}

interface ContentTableProps {
  title?: string
  description?: string
  data: ContentItem[] | ScheduledRelease[]
  showStage?: boolean
  showItemCount?: boolean
  showUpdatedAt?: boolean
  showUpdatedBy?: boolean
}

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

const formatDate = (dateStr: string | undefined) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString();
};

export function ContentTable({ 
  title, 
  description, 
  data = [], 
  showStage = false,
  showItemCount = false,
  showUpdatedAt = false,
  showUpdatedBy = false
}: ContentTableProps) {
  // Check if the data is ScheduledRelease[]
  const isScheduledReleaseData = data.length > 0 && 'scheduledDateTime' in data[0];

  return (
    <Card>
      <CardHeader>
        {(title || description) && (
          <div className="flex items-center justify-between">
            <div>
              {title && <CardTitle>{title}</CardTitle>}
              {description && <CardDescription>{description}</CardDescription>}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              {isScheduledReleaseData ? (
                <>
                  <TableHead>Scheduled Date & Time</TableHead>
                  <TableHead>Status</TableHead>
                  {showItemCount && <TableHead>Items</TableHead>}
                  {showUpdatedAt && <TableHead>Last Updated</TableHead>}
                  {showUpdatedBy && <TableHead>Last Updated By</TableHead>}
                </>
              ) : (
                <>
                  <TableHead>Author</TableHead>
                  {showStage && <TableHead>Stage</TableHead>}
                  <TableHead>Workflow</TableHead>
                  <TableHead>Date</TableHead>
                </>
              )}
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  <Link href="#" className="hover:underline">
                    {item.title}
                  </Link>
                </TableCell>
                {isScheduledReleaseData ? (
                  <>
                    <TableCell>{formatDateTime((item as ScheduledRelease).scheduledDateTime)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.status}</Badge>
                    </TableCell>
                    {showItemCount && (
                      <TableCell>{(item as ScheduledRelease).itemCount} items</TableCell>
                    )}
                    {showUpdatedAt && (
                      <TableCell>{formatDateTime((item as ScheduledRelease).updatedAt)}</TableCell>
                    )}
                    {showUpdatedBy && (
                      <TableCell>{(item as ScheduledRelease).updatedBy}</TableCell>
                    )}
                  </>
                ) : (
                  <>
                    <TableCell>{(item as ContentItem).author}</TableCell>
                    {showStage && (
                      <TableCell>
                        <Badge
                          variant={
                            (item as ContentItem).stage === "Published"
                              ? "default"
                              : (item as ContentItem).stage === "Needs Update"
                                ? "destructive"
                                : (item as ContentItem).stage === "Ready to Publish" ||
                                    (item as ContentItem).stage === "Scheduled" ||
                                    (item as ContentItem).stage === "Ready to Launch"
                                  ? "outline"
                                  : "secondary"
                          }
                        >
                          {(item as ContentItem).stage}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell>{(item as ContentItem).workflow}</TableCell>
                    <TableCell>{formatDate((item as ContentItem).date)}</TableCell>
                  </>
                )}
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>View</DropdownMenuItem>
                      {!isScheduledReleaseData && <DropdownMenuItem>Edit</DropdownMenuItem>}
                      {isScheduledReleaseData && <DropdownMenuItem>Reschedule</DropdownMenuItem>}
                      {isScheduledReleaseData && <DropdownMenuItem className="text-red-600">Cancel Release</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
