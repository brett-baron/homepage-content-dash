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
  author: string
  status: string
  workflow: string
  stage?: string
  date: string
}

interface ContentTableProps {
  title: string
  description: string
  data: ContentItem[]
  showStage?: boolean
}

export function ContentTable({ title, description, data = [], showStage = true }: ContentTableProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button size="sm" variant="outline">
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Author</TableHead>
              {showStage && <TableHead>Stage</TableHead>}
              <TableHead>Workflow</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data &&
              data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <Link href="#" className="hover:underline">
                      {item.title}
                    </Link>
                  </TableCell>
                  <TableCell>{item.author}</TableCell>
                  {showStage && (
                    <TableCell>
                      <Badge
                        variant={
                          item.stage === "Published"
                            ? "default"
                            : item.stage === "Needs Update"
                              ? "destructive"
                              : item.stage === "Ready to Publish" ||
                                  item.stage === "Scheduled" ||
                                  item.stage === "Ready to Launch"
                                ? "outline"
                                : "secondary"
                        }
                      >
                        {item.stage}
                      </Badge>
                    </TableCell>
                  )}
                  <TableCell>{item.workflow}</TableCell>
                  <TableCell>{new Date(item.date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem>View</DropdownMenuItem>
                        <DropdownMenuItem>Duplicate</DropdownMenuItem>
                        <DropdownMenuItem>Delete</DropdownMenuItem>
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
