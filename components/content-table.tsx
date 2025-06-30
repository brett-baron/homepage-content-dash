import { useSDK } from '@contentful/react-apps-toolkit';
import { useCMA } from '@contentful/react-apps-toolkit';
import { HomeAppSDK } from '@contentful/app-sdk';
import { Datepicker } from '@contentful/f36-datepicker';
import { 
  Box, 
  Flex, 
  FormControl, 
  Select,
  Modal,
  Button as ContentfulButton,
  Card,
  Badge,
  Table as ContentfulTable,
  IconButton,
  Menu,
  Text,
  Subheading,
  TextInput,
  Form,
  Autocomplete
} from '@contentful/f36-components';
import { MoreHorizontalIcon } from '@contentful/f36-icons';
import Link from "next/link"
import { useState, useEffect, useMemo } from "react"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArchiveIcon, RotateCcw } from "lucide-react";

interface ContentItem {
  id: string
  title: string | React.ReactNode
  author: string // Keep as 'author' for internal consistency with existing code
  status: string
  workflow: string
  stage: string
  date: string
  isShowMoreRow?: boolean
  fieldStatus?: {
    [key: string]: string | {
      [locale: string]: string;
    }
  } | null
  needsUpdate?: boolean
  age?: number
}

interface EntryStatus {
  type: 'draft' | 'published' | 'changed'
  label: string
  variant: 'warning' | 'positive' | 'primary'
}

interface ScheduledReleaseStatus {
  type: 'scheduled' | 'cancelled' | 'completed'
  label: string
  variant: 'primary' | 'negative' | 'positive'
}

interface ScheduledRelease {
  id: string
  title: string | React.ReactNode
  scheduledDateTime: string
  status: string
  itemCount: number
  updatedAt: string
  updatedBy: string
  isShowMoreRow?: boolean
}

interface ContentTableProps {
  title?: string
  description?: string
  data: ContentItem[] | ScheduledRelease[]
  showStage?: boolean
  showItemCount?: boolean
  showUpdatedAt?: boolean
  showUpdatedBy?: boolean
  onReschedule?: (releaseId: string, newDateTime: string) => Promise<void>
  onCancel?: (releaseId: string) => Promise<void>
  onEntryClick?: (entryId: string) => void
  hideActions?: boolean
  showAge?: boolean
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

// Helper function to map CMA entry to ContentItem
const mapCMAEntryToContentItem = (entry: any): ContentItem => {
  return {
    id: entry.sys.id,
    title: entry.fields?.internalName?.['en-US'] || entry.fields?.title?.['en-US'] || 'Untitled',
    author: entry.sys.createdBy?.sys?.id || 'Unknown',
    status: entry.sys.publishedVersion ? 'Published' : 'Draft',
    workflow: entry.sys.contentType?.sys?.id || '',
    stage: entry.sys.publishedVersion ? 'Published' : 'Draft',
    date: entry.sys.publishedAt || entry.sys.updatedAt,
    fieldStatus: entry.sys.fieldStatus || null,
    needsUpdate: false,
    age: entry.sys.age
  };
};

// Helper function to determine entry status
const determineEntryStatus = (item: ContentItem): EntryStatus => {
  if (item.fieldStatus && typeof item.fieldStatus === 'object') {
    const hasChangedStatus = Object.entries(item.fieldStatus).some(([key, value]) => {
      if (typeof value === 'object') {
        return Object.values(value).some(status => status === 'changed');
      }
      return value === 'changed';
    });
    
    if (hasChangedStatus) {
      return {
        type: 'changed',
        label: 'Changed',
        variant: 'primary'
      };
    }
  }

  if (item.stage === 'Published' || item.status === 'Published') {
    return {
      type: 'published',
      label: 'Published',
      variant: 'positive'
    };
  }

  if (item.status === 'Draft' || item.stage === 'Draft') {
    return {
      type: 'draft',
      label: 'Draft',
      variant: 'warning'
    };
  }

  const displayStatus = item.stage || item.status;
  return {
    type: 'published',
    label: displayStatus,
    variant: 'positive'
  };
};

// Helper function to determine scheduled release status
const determineScheduledReleaseStatus = (status: string): ScheduledReleaseStatus => {
  switch (status.toLowerCase()) {
    case 'scheduled':
      return {
        type: 'scheduled',
        label: 'Scheduled',
        variant: 'primary'
      };
    case 'cancelled':
      return {
        type: 'cancelled',
        label: 'Cancelled',
        variant: 'negative'
      };
    case 'completed':
      return {
        type: 'completed',
        label: 'Completed',
        variant: 'positive'
      };
    default:
      return {
        type: 'scheduled',
        label: status,
        variant: 'primary'
      };
  }
};

export function ContentTable({ 
  title, 
  description, 
  data = [], 
  showStage = false,
  showItemCount = false,
  showUpdatedAt = false,
  showUpdatedBy = false,
  onReschedule,
  onCancel,
  onEntryClick,
  hideActions = false,
  showAge = false
}: ContentTableProps) {
  const sdk = useSDK<HomeAppSDK>();
  const cma = useCMA();
  const [selectedRelease, setSelectedRelease] = useState<ScheduledRelease | null>(null);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState("12:00 PM");
  const [selectedTimezone, setSelectedTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [isLoading, setIsLoading] = useState(false);

  // Check if the data is ScheduledRelease[]
  const isScheduledReleaseData = data.length > 0 && 'scheduledDateTime' in data[0];

  // Add effect to enrich data with CMA responses
  const [enrichedData, setEnrichedData] = useState<(ContentItem | ScheduledRelease)[]>(data);
  useEffect(() => {
    const enrichDataWithCMA = async () => {
      if (!isScheduledReleaseData) {
        try {
          const enrichedItems = await Promise.all(
            data.map(async (item) => {
              if (item.isShowMoreRow) return item as ContentItem;
              
              const contentItem = item as ContentItem;
              try {
                const entry = await cma.entry.get({
                  entryId: contentItem.id,
                  spaceId: sdk.ids.space,
                  environmentId: sdk.ids.environment
                });
                
                return {
                  ...contentItem,
                  fieldStatus: entry.sys.fieldStatus as ContentItem['fieldStatus']
                };
              } catch (error) {
                return contentItem;
              }
            })
          );
          
          setEnrichedData(enrichedItems as (ContentItem | ScheduledRelease)[]);
        } catch (error) {
          // Silently handle error - consider adding error state if needed
          setEnrichedData(data);
        }
      } else {
        setEnrichedData(data);
      }
    };

    enrichDataWithCMA();
  }, [data, cma, sdk.ids.space, sdk.ids.environment, isScheduledReleaseData]);

  // Use enrichedData instead of data for rendering
  const sortedData = isScheduledReleaseData 
    ? [...enrichedData].sort((a, b) => {
        if (a.isShowMoreRow || b.isShowMoreRow) return 0;
        return new Date((a as ScheduledRelease).scheduledDateTime).getTime() - 
               new Date((b as ScheduledRelease).scheduledDateTime).getTime();
      })
    : enrichedData;

  const handleViewRelease = (release: ScheduledRelease) => {
    const baseUrl = 'https://launch.contentful.com';
    const url = `${baseUrl}/spaces/${sdk.ids.space}/releases/${release.id}`;
    window.open(url, '_blank');
  };

  const handleRescheduleRelease = async (release: ScheduledRelease) => {
    setSelectedRelease(release);
    const date = new Date(release.scheduledDateTime);
    setSelectedDate(date);
    
    // Format time in 12-hour format with AM/PM
    const timeStr = date.toLocaleTimeString('en-US', { 
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    setSelectedTime(timeStr);
    
    setIsRescheduleModalOpen(true);
  };

  const handleRescheduleConfirm = async () => {
    if (!selectedRelease || !selectedDate) return;
    
    setIsLoading(true);
    try {
      // Get the scheduled action for this release, specifically querying for scheduled status
      const scheduledActions = await cma.scheduledActions.getMany({
        spaceId: sdk.ids.space,
        query: {
          'entity.sys.id': selectedRelease.id,
          'environment.sys.id': sdk.ids.environment,
          'sys.status': 'scheduled'  // Only get actions with scheduled status
        }
      });

      console.log('Found scheduled actions:', scheduledActions.items);

      // Find the active scheduled action
      const action = scheduledActions.items[0];
      if (!action) {
        // If no scheduled action found, try to get all actions to check their status
        const allActions = await cma.scheduledActions.getMany({
          spaceId: sdk.ids.space,
          query: {
            'entity.sys.id': selectedRelease.id,
            'environment.sys.id': sdk.ids.environment
          }
        });

        if (allActions.items.length > 0) {
          // There are actions but none are scheduled - the UI is out of sync
          throw new Error('Release status has changed. Please refresh the page to see the current status.');
        } else {
          throw new Error('No scheduled action found for this release');
        }
      }

      console.log('Selected action:', {
        id: action.sys.id,
        status: action.sys.status,
        version: action.sys.version,
        scheduledFor: action.scheduledFor
      });

      // Parse the time in 12-hour format
      const [time, period] = selectedTime.split(' ');
      const [hours, minutes] = time.split(':');
      let hour24 = parseInt(hours, 10);
      
      // Convert to 24-hour format
      if (period.toUpperCase() === 'PM' && hour24 !== 12) {
        hour24 += 12;
      } else if (period.toUpperCase() === 'AM' && hour24 === 12) {
        hour24 = 0;
      }

      // Create a new Date object with the selected date and time
      const newDate = new Date(selectedDate);
      newDate.setHours(hour24, parseInt(minutes, 10), 0, 0);

      // Validate that the new date is in the future
      if (newDate <= new Date()) {
        throw new Error('Scheduled date and time must be in the future');
      }

      // Format the date in ISO 8601 format
      const isoDate = newDate.toISOString();

      console.log('Updating scheduled action:', {
        actionId: action.sys.id,
        version: action.sys.version,
        newDateTime: isoDate,
        timezone: selectedTimezone
      });
      
      try {
        // Update the scheduled action with new datetime
        const updatedAction = await cma.scheduledActions.update(
          {
            spaceId: sdk.ids.space,
            version: action.sys.version,
            scheduledActionId: action.sys.id
          },
          {
            entity: action.entity,
            environment: action.environment,
            action: action.action,
            scheduledFor: {
              datetime: isoDate,
              timezone: selectedTimezone
            }
          }
        );

        console.log('Update response:', updatedAction);

        setIsRescheduleModalOpen(false);
        if (onReschedule) {
          await onReschedule(selectedRelease.id, isoDate);
        }
        
        // Show success notification
        sdk.notifier.success('Release has been rescheduled successfully');
      } catch (updateError) {
        // If update fails, check if the action status has changed
        const refreshedAction = await cma.scheduledActions.get({
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment,
          scheduledActionId: action.sys.id
        });

        if (refreshedAction.sys.status !== 'scheduled') {
          throw new Error('Release status has changed while updating. Please refresh the page to see the current status.');
        } else {
          throw updateError;
        }
      }
    } catch (error) {
      console.error('Error rescheduling release:', error);
      
      // Log the full error details
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack,
          // @ts-ignore
          details: error.details,
          // @ts-ignore
          request: error.request
        });
      }
      
      // Handle specific error cases
      let errorMessage = 'Failed to reschedule release. Please try again.';
      if (error instanceof Error) {
        if (error.message.includes('status has changed')) {
          errorMessage = error.message;
          // Close the modal since the status is out of sync
          setIsRescheduleModalOpen(false);
        } else if (error.message.includes('Cannot update scheduled action')) {
          errorMessage = 'This release cannot be rescheduled. Please refresh the page to get the latest status.';
          setIsRescheduleModalOpen(false);
        } else {
          errorMessage = `Error: ${error.message}`;
        }
      }
      
      sdk.notifier.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelRelease = async (release: ScheduledRelease) => {
    setSelectedRelease(release);
    setIsCancelModalOpen(true);
  };

  const handleCancelConfirm = async () => {
    if (!selectedRelease) return;
    
    setIsLoading(true);
    try {
      // Get the scheduled action for this release
      const scheduledActions = await cma.scheduledActions.getMany({
        spaceId: sdk.ids.space,
        query: {
          'entity.sys.id': selectedRelease.id,
          'environment.sys.id': sdk.ids.environment
        }
      });

      const action = scheduledActions.items[0];
      if (!action) throw new Error('No scheduled action found for this release');

      // Delete the scheduled action
      await cma.scheduledActions.delete({
        spaceId: sdk.ids.space,
        scheduledActionId: action.sys.id
      });

      if (onCancel) {
        await onCancel(selectedRelease.id);
      }
      setIsCancelModalOpen(false);
    } catch (error) {
      console.error('Error canceling release:', error);
      sdk.notifier.error('Failed to cancel release. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Card>
        {(title || description) && (
          <Box padding="spacingM">
            <Flex justifyContent="space-between" alignItems="center">
              <div>
                {title && <Subheading marginBottom="spacingXs">{title}</Subheading>}
                {description && <Text>{description}</Text>}
              </div>
            </Flex>
          </Box>
        )}

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
                  <TableHead>Creator</TableHead>
                  {showStage && <TableHead>Status</TableHead>}
                  <TableHead>Content Type</TableHead>
                  {showAge && <TableHead>Age</TableHead>}
                  <TableHead>Published Date</TableHead>
                </>
              )}
              {!hideActions && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No entries found.
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((item) => (
                <TableRow 
                  key={item.id}
                  className={item.isShowMoreRow ? 'hover:bg-transparent border-0' : undefined}
                >
                  <TableCell colSpan={item.isShowMoreRow ? (isScheduledReleaseData ? 6 : 5) : undefined}>
                    {item.isShowMoreRow ? (
                      item.title
                    ) : (
                      <Link 
                        href="#" 
                        className="hover:underline"
                        onClick={(e) => {
                          e.preventDefault();
                          if (onEntryClick && !isScheduledReleaseData) {
                            onEntryClick(item.id);
                          } else if (isScheduledReleaseData) {
                            handleViewRelease(item as ScheduledRelease);
                          }
                        }}
                      >
                        {item.title}
                      </Link>
                    )}
                  </TableCell>
                  {!item.isShowMoreRow && (
                    isScheduledReleaseData ? (
                      <>
                        <TableCell>{formatDateTime((item as ScheduledRelease).scheduledDateTime)}</TableCell>
                        <TableCell>
                          {(() => {
                            const releaseStatus = determineScheduledReleaseStatus(item.status);
                            return <Badge variant={releaseStatus.variant}>{releaseStatus.label}</Badge>;
                          })()}
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
                            {(() => {
                              const contentItem = item as ContentItem;
                              const entryStatus = determineEntryStatus(contentItem);
                              return <Badge variant={entryStatus.variant}>{entryStatus.label}</Badge>;
                            })()}
                          </TableCell>
                        )}
                        <TableCell>{(item as ContentItem).workflow}</TableCell>
                        {showAge && <TableCell>{(item as ContentItem).age} days</TableCell>}
                        <TableCell>{formatDate((item as ContentItem).date)}</TableCell>
                      </>
                    )
                  )}
                  {!hideActions && !item.isShowMoreRow && (
                    <TableCell>
                      <Menu>
                        <Menu.Trigger>
                          <IconButton
                            variant="transparent"
                            icon={<MoreHorizontalIcon />}
                            aria-label="Actions"
                            isDisabled={isLoading}
                          />
                        </Menu.Trigger>
                        {isScheduledReleaseData ? (
                          <Menu.List>
                            <Menu.Item onClick={() => handleViewRelease(item as ScheduledRelease)}>
                              View
                            </Menu.Item>
                            <Menu.Item onClick={() => handleRescheduleRelease(item as ScheduledRelease)}>
                              Reschedule
                            </Menu.Item>
                            <Menu.Item 
                              onClick={() => handleCancelRelease(item as ScheduledRelease)}
                            >
                              Cancel Release
                            </Menu.Item>
                          </Menu.List>
                        ) : (
                          <Menu.List>
                            <Menu.Item onClick={() => onEntryClick && onEntryClick(item.id)}>Edit</Menu.Item>
                          </Menu.List>
                        )}
                      </Menu>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Contentful Modals */}
      <Modal
        isShown={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
      >
        {() => (
          <Box>
            <Modal.Header 
              title="Cancel Release" 
              onClose={() => setIsCancelModalOpen(false)} 
            />
            <Modal.Content>
              <Text>
                Are you sure you want to cancel this release? This action cannot be undone.
              </Text>
            </Modal.Content>
            <Modal.Controls>
              <ContentfulButton
                variant="secondary"
                onClick={() => setIsCancelModalOpen(false)}
                isDisabled={isLoading}
              >
                No, keep release
              </ContentfulButton>
              <ContentfulButton
                variant="negative"
                onClick={handleCancelConfirm}
                isDisabled={isLoading}
                isLoading={isLoading}
              >
                Yes, cancel release
              </ContentfulButton>
            </Modal.Controls>
          </Box>
        )}
      </Modal>

      <Modal
        isShown={isRescheduleModalOpen}
        onClose={() => setIsRescheduleModalOpen(false)}
      >
        {() => (
          <Box>
            <Modal.Header title="Reschedule Release" onClose={() => setIsRescheduleModalOpen(false)} />
            <Modal.Content>
              <Flex flexDirection="column" gap="spacingM">
                <FormControl>
                  <FormControl.Label>Date</FormControl.Label>
                  <Datepicker
                    selected={selectedDate || undefined}
                    onSelect={(date: Date | undefined) => setSelectedDate(date || null)}
                    dateFormat="dd MMM yyyy"
                  />
                </FormControl>

                <FormControl>
                  <FormControl.Label>Time</FormControl.Label>
                  <div className="relative">
                    <TextInput
                      value={selectedTime}
                      onChange={(e) => {
                        const value = e.target.value;
                        const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i;
                        if (timeRegex.test(value) || value === '') {
                          setSelectedTime(value.toUpperCase());
                        }
                      }}
                      placeholder="Select or type a time (e.g. 8:00 PM)"
                    />
                    <Menu>
                      <Menu.Trigger>
                        <IconButton
                          variant="transparent"
                          icon={<MoreHorizontalIcon />}
                          aria-label="Select time"
                          className="absolute right-2 top-1/2 transform -translate-y-1/2"
                        />
                      </Menu.Trigger>
                      <Menu.List className="max-h-60 overflow-y-auto">
                        {Array.from({ length: 48 }).map((_, i) => {
                          const hour = Math.floor(i / 2);
                          const minute = (i % 2) * 30;
                          const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                          const period = hour >= 12 ? 'PM' : 'AM';
                          const time = `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
                          return (
                            <Menu.Item
                              key={time}
                              onClick={() => setSelectedTime(time)}
                            >
                              {time}
                            </Menu.Item>
                          );
                        })}
                      </Menu.List>
                    </Menu>
                  </div>
                </FormControl>

                <FormControl>
                  <FormControl.Label>Timezone</FormControl.Label>
                  <Select
                    value={selectedTimezone}
                    onChange={(e) => setSelectedTimezone(e.target.value)}
                  >
                    {Intl.supportedValuesOf('timeZone').map((tz) => {
                      // Get UTC offset for the timezone
                      const date = new Date();
                      const utcOffset = new Intl.DateTimeFormat('en-US', {
                        timeZone: tz,
                        timeZoneName: 'longOffset'
                      }).format(date).split(' ').pop();
                      
                      return (
                        <Select.Option key={tz} value={tz}>
                          {`${tz} (${utcOffset})`}
                        </Select.Option>
                      );
                    })}
                  </Select>
                </FormControl>
              </Flex>
            </Modal.Content>
            <Modal.Controls>
              <ContentfulButton
                variant="secondary"
                onClick={() => setIsRescheduleModalOpen(false)}
                isDisabled={isLoading}
              >
                Cancel
              </ContentfulButton>
              <ContentfulButton
                variant="primary"
                onClick={handleRescheduleConfirm}
                isDisabled={isLoading || !selectedDate}
                isLoading={isLoading}
              >
                Save Changes
              </ContentfulButton>
            </Modal.Controls>
          </Box>
        )}
      </Modal>
    </>
  )
}
