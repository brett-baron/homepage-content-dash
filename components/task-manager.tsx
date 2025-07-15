import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { CalendarDays, ExternalLink, MoreHorizontal, Trash2, AlertTriangle, Clock, ChevronDown, ChevronRight } from "lucide-react"
import { format, isToday, isTomorrow, isPast, parseISO, formatDistanceToNow } from "date-fns"

interface Task {
  id: string
  name: string
  contentfulEntry: {
    id: string
    title: string
    type: string
  }
  dueDate: string
  createdDate: string
  completed: boolean
}

const initialTasks: Task[] = [
  {
    id: "1",
    name: "Review blog post content",
    contentfulEntry: {
      id: "entry-123",
      title: "Getting Started with Headless CMS",
      type: "Blog Post",
    },
    dueDate: "2024-01-15",
    createdDate: "2024-01-10T09:00:00Z",
    completed: false,
  },
  {
    id: "2",
    name: "Update product description",
    contentfulEntry: {
      id: "entry-456",
      title: "Premium Subscription Plan",
      type: "Product",
    },
    dueDate: "2024-01-14",
    createdDate: "2024-01-12T14:30:00Z",
    completed: false,
  },
  {
    id: "3",
    name: "Approve landing page copy",
    contentfulEntry: {
      id: "entry-789",
      title: "Homepage Hero Section",
      type: "Page Section",
    },
    dueDate: "2024-01-16",
    createdDate: "2024-01-08T11:15:00Z",
    completed: true,
  },
]

export default function TaskManager() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [showCompleted, setShowCompleted] = useState(false)

  const toggleTaskCompletion = (taskId: string) => {
    setTasks(tasks.map((task) => (task.id === taskId ? { ...task, completed: !task.completed } : task)))
  }

  const deleteTask = (taskId: string) => {
    setTasks(tasks.filter((task) => task.id !== taskId))
  }

  const getDueDateInfo = (dueDate: string) => {
    const date = parseISO(dueDate)
    const isOverdue = isPast(date) && !isToday(date)

    let status = ""
    let statusColor = ""

    if (isOverdue) {
      status = "OVERDUE"
      statusColor = "bg-red-500 text-white"
    } else if (isToday(date)) {
      status = "DUE TODAY"
      statusColor = "bg-orange-500 text-white"
    } else if (isTomorrow(date)) {
      status = "DUE TOMORROW"
      statusColor = "bg-blue-500 text-white"
    }

    return {
      formatted: format(date, "MMM d, yyyy"),
      status,
      statusColor,
      isOverdue,
    }
  }

  const getTaskAge = (createdDate: string) => {
    return formatDistanceToNow(parseISO(createdDate), { addSuffix: true })
  }

  const openTasks = tasks.filter((task) => !task.completed)
  const completedTasks = tasks.filter((task) => task.completed)

  return (
    <Card className="w-full max-w-6xl">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Tasks</CardTitle>
        </div>
        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
          <span>{openTasks.length} open</span>
          <span>•</span>
          <span>{completedTasks.length} completed</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Open Tasks */}
        {openTasks.map((task) => {
          const dueDateInfo = getDueDateInfo(task.dueDate)
          const taskAge = getTaskAge(task.createdDate)

          return (
            <div
              key={task.id}
              className="grid grid-cols-12 gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors items-center"
            >
              {/* Checkbox Section */}
              <div className="col-span-1 flex justify-center">
                <Checkbox checked={task.completed} onCheckedChange={() => toggleTaskCompletion(task.id)} />
              </div>

              {/* Content Name & Link Section */}
              <div className="col-span-4">
                <h4 className="font-semibold text-sm mb-1">{task.name}</h4>
                <button className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 transition-colors text-sm">
                  <span className="truncate">{task.contentfulEntry.title}</span>
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </button>
              </div>

              {/* Content Type Section */}
              <div className="col-span-2">
                <Badge variant="secondary" className="text-xs px-3 py-1">
                  {task.contentfulEntry.type}
                </Badge>
              </div>

              {/* Due Date Section */}
              <div className="col-span-2">
                <div className="text-sm text-muted-foreground mb-1">
                  <CalendarDays className="h-3 w-3 inline mr-1" />
                  {dueDateInfo.formatted}
                </div>
                {dueDateInfo.status && (
                  <Badge className={`text-xs px-2 py-1 ${dueDateInfo.statusColor}`}>
                    {dueDateInfo.isOverdue && <AlertTriangle className="h-3 w-3 mr-1" />}
                    {dueDateInfo.status}
                  </Badge>
                )}
              </div>

              {/* Age Section */}
              <div className="col-span-2">
                <div className="text-sm text-muted-foreground">
                  <Clock className="h-3 w-3 inline mr-1" />
                  Created {taskAge}
                </div>
              </div>

              {/* Actions Section */}
              <div className="col-span-1 flex justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => deleteTask(task.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )
        })}

        {/* Completed Tasks Dropdown */}
        {completedTasks.length > 0 && (
          <div className="pt-4">
            <Button
              variant="ghost"
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-2 p-0 h-auto text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {showCompleted ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Completed ({completedTasks.length})
            </Button>
            
            {showCompleted && (
              <div className="mt-2 space-y-2">
                {completedTasks.map((task) => {
                  const dueDateInfo = getDueDateInfo(task.dueDate)
                  const taskAge = getTaskAge(task.createdDate)

                  return (
                    <div
                      key={task.id}
                      className="grid grid-cols-12 gap-4 p-4 rounded-lg border bg-muted/30 opacity-75 items-center"
                    >
                      {/* Checkbox Section */}
                      <div className="col-span-1 flex justify-center">
                        <Checkbox checked={task.completed} onCheckedChange={() => toggleTaskCompletion(task.id)} />
                      </div>

                      {/* Content Name & Link Section */}
                      <div className="col-span-4">
                        <h4 className="font-semibold text-sm mb-1 line-through text-muted-foreground">{task.name}</h4>
                        <span className="text-sm text-muted-foreground truncate">{task.contentfulEntry.title}</span>
                      </div>

                      {/* Content Type Section */}
                      <div className="col-span-2">
                        <Badge variant="secondary" className="text-xs px-3 py-1 opacity-60">
                          {task.contentfulEntry.type}
                        </Badge>
                      </div>

                      {/* Due Date Section */}
                      <div className="col-span-2">
                        <div className="text-sm text-muted-foreground">
                          <CalendarDays className="h-3 w-3 inline mr-1" />
                          {dueDateInfo.formatted}
                        </div>
                        <Badge variant="outline" className="text-xs mt-1">
                          Completed
                        </Badge>
                      </div>

                      {/* Age Section */}
                      <div className="col-span-2">
                        <div className="text-sm text-muted-foreground">
                          <Clock className="h-3 w-3 inline mr-1" />
                          Created {taskAge}
                        </div>
                      </div>

                      {/* Actions Section */}
                      <div className="col-span-1 flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => deleteTask(task.id)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tasks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">No tasks yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}