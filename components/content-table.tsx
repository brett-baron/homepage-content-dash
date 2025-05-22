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
  author?: string
  status: string
  workflow?: string | React.ReactNode
  stage?: string
  date?: string
  isShowMoreRow?: boolean
  needsUpdate?: boolean
  fieldStatus?: {
    '*': {
      [locale: string]: 'draft' | 'published' | 'changed'
    }
  } | null
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
  isOrphanedContent?: boolean
  onArchiveEntries?: (entryIds: string[]) => Promise<void>
  onUnpublishEntries?: (entryIds: string[]) => Promise<void>
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
    needsUpdate: false
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
  isOrphanedContent = false,
  onArchiveEntries,
  onUnpublishEntries
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
  
  // New states for selection
  const [selectedRows, setSelectedRows] = useState<{[key: string]: boolean}>({});
  const [selectAll, setSelectAll] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isUnpublishDialogOpen, setIsUnpublishDialogOpen] = useState(false);

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

  // Reset selection when data changes
  useEffect(() => {
    setSelectedRows({});
    setSelectAll(false);
  }, [data]);

  // Calculate number of selected rows
  const selectedCount = useMemo(() => {
    return Object.values(selectedRows).filter(Boolean).length;
  }, [selectedRows]);

  // Handle "Select All" checkbox
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    
    // Only select non-showMoreRow items
    const newSelectedRows: {[key: string]: boolean} = {};
    sortedData.forEach(item => {
      if (!item.isShowMoreRow) {
        newSelectedRows[item.id] = checked;
      }
    });
    
    setSelectedRows(newSelectedRows);
  };

  // Handle individual row selection
  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedRows(prev => ({
      ...prev,
      [id]: checked
    }));
    
    // Update selectAll state based on selection
    const actualItems = sortedData.filter(item => !item.isShowMoreRow);
    const newSelectedRows = {
      ...selectedRows,
      [id]: checked
    };
    
    // Check if all actual items are now selected
    const allSelected = actualItems.every(item => 
      newSelectedRows[item.id] === true
    );
    
    setSelectAll(allSelected);
  };

  // Get array of selected entry IDs
  const getSelectedEntryIds = (): string[] => {
    return Object.entries(selectedRows)
      .filter(([_, isSelected]) => isSelected)
      .map(([id]) => id);
  };

  // Archive selected entries
  const handleArchiveEntries = async () => {
    const entryIds = getSelectedEntryIds();
    if (entryIds.length === 0) return;
    
    setIsLoading(true);
    try {
      if (onArchiveEntries) {
        await onArchiveEntries(entryIds);
      }
      // Reset selection after successful operation
      setSelectedRows({});
      setSelectAll(false);
    } catch (error) {
      console.error('Error archiving entries:', error);
      sdk.notifier.error('Failed to archive selected entries. Please try again.');
    } finally {
      setIsLoading(false);
      setIsArchiveDialogOpen(false);
    }
  };

  // Unpublish selected entries
  const handleUnpublishEntries = async () => {
    const entryIds = getSelectedEntryIds();
    if (entryIds.length === 0) return;
    
    setIsLoading(true);
    try {
      if (onUnpublishEntries) {
        await onUnpublishEntries(entryIds);
      }
      // Reset selection after successful operation
      setSelectedRows({});
      setSelectAll(false);
    } catch (error) {
      console.error('Error unpublishing entries:', error);
      sdk.notifier.error('Failed to unpublish selected entries. Please try again.');
    } finally {
      setIsLoading(false);
      setIsUnpublishDialogOpen(false);
    }
  };

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

  // Add effect to fetch and log full entry data for each item
  useEffect(() => {
    const fetchEntryDetails = async () => {
      if (!isScheduledReleaseData) {
        for (const item of data) {
          try {
            const contentItem = item as ContentItem;
            const entry = await cma.entry.get({
              entryId: contentItem.id,
              spaceId: sdk.ids.space,
              environmentId: sdk.ids.environment
            });
          } catch (error) {
            console.error('Error fetching entry details:', {
              entryId: (item as ContentItem).id,
              error
            });
          }
        }
      }
    };

    fetchEntryDetails();
  }, [data, cma, sdk.ids.space, sdk.ids.environment, isScheduledReleaseData]);

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

        {/* Action Buttons for Orphaned Content */}
        {isOrphanedContent && (
          <Box padding="spacingS" paddingBottom="spacingM">
            <Flex justifyContent="space-between" alignItems="center">
              <Text className="text-sm">
                {selectedCount} of {sortedData.filter(item => !item.isShowMoreRow).length} entries selected
              </Text>
              <Flex gap="spacingS">
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={selectedCount === 0 || isLoading}
                  onClick={() => setIsUnpublishDialogOpen(true)}
                  className="opacity-90 hover:opacity-100 transition-opacity"
                >
                  <RotateCcw size={16} className="mr-1" />
                  Unpublish Selected
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={selectedCount === 0 || isLoading}
                  onClick={() => setIsArchiveDialogOpen(true)}
                  className="opacity-90 hover:opacity-100 transition-opacity"
                >
                  <ArchiveIcon size={16} className="mr-1" />
                  Archive Selected
                </Button>
              </Flex>
            </Flex>
          </Box>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              {isOrphanedContent && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                    aria-label="Select all rows"
                  />
                </TableHead>
              )}
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
                  {showStage && <TableHead>Status</TableHead>}
                  <TableHead>Content Type</TableHead>
                  <TableHead>Published Date</TableHead>
                </>
              )}
              {!hideActions && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isOrphanedContent ? 6 : 5} className="h-24 text-center">
                  {isOrphanedContent ? (
                    <div className="flex flex-col items-center space-y-2">
                      <p className="font-medium">No orphaned entries found</p>
                      <p className="text-sm text-muted-foreground">All your content is properly referenced by other entries.</p>
                    </div>
                  ) : (
                    "No entries found."
                  )}
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((item) => (
                <TableRow 
                  key={item.id}
                  className={item.isShowMoreRow ? 'hover:bg-transparent border-0' : undefined}
                  data-state={selectedRows[item.id] ? "selected" : undefined}
                >
                  {isOrphanedContent && !item.isShowMoreRow && (
                    <TableCell className="w-12">
                      <Checkbox
                        checked={!!selectedRows[item.id]}
                        onCheckedChange={(checked) => handleSelectRow(item.id, !!checked)}
                        aria-label={`Select ${item.title}`}
                      />
                    </TableCell>
                  )}
                  {isOrphanedContent && item.isShowMoreRow && (
                    <TableCell />
                  )}
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
                            {isOrphanedContent && (
                              <>
                                <Menu.Item 
                                  onClick={() => {
                                    setSelectedRows({[item.id]: true});
                                    setIsUnpublishDialogOpen(true);
                                  }}
                                  isDisabled={isLoading}
                                >
                                  <Flex alignItems="center" gap="spacingXs">
                                    <RotateCcw size={14} />
                                    <span>Unpublish</span>
                                  </Flex>
                                </Menu.Item>
                                <Menu.Item 
                                  onClick={() => {
                                    setSelectedRows({[item.id]: true});
                                    setIsArchiveDialogOpen(true);
                                  }}
                                  isDisabled={isLoading}
                                >
                                  <Flex alignItems="center" gap="spacingXs">
                                    <ArchiveIcon size={14} />
                                    <span>Archive</span>
                                  </Flex>
                                </Menu.Item>
                              </>
                            )}
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

      {/* ShadCN UI Dialogs for Archive and Unpublish */}
      <Dialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-4">
            <DialogTitle className="text-xl">Archive {selectedCount === 1 ? 'Entry' : 'Entries'}</DialogTitle>
            <DialogDescription className="mt-4 text-sm">
              {selectedCount === 1 
                ? "Are you sure you want to archive this entry? It will be moved to the archive and no longer accessible in the content model."
                : `Are you sure you want to archive ${selectedCount} entries? They will be moved to the archive and no longer accessible in the content model.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex sm:justify-end gap-2 mt-5">
            <Button
              variant="outline"
              onClick={() => setIsArchiveDialogOpen(false)}
              disabled={isLoading}
              className="sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchiveEntries}
              disabled={isLoading}
              className="sm:w-auto gap-2"
            >
              {isLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                  <span>Archiving...</span>
                </>
              ) : (
                <>
                  <ArchiveIcon size={16} />
                  <span>Archive {selectedCount === 1 ? 'Entry' : 'Entries'}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isUnpublishDialogOpen} onOpenChange={setIsUnpublishDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-4">
            <DialogTitle className="text-xl">Unpublish {selectedCount === 1 ? 'Entry' : 'Entries'}</DialogTitle>
            <DialogDescription className="mt- text-sm">
              {selectedCount === 1 
                ? "Are you sure you want to unpublish this entry? It will be removed from your published content but kept as a draft."
                : `Are you sure you want to unpublish ${selectedCount} entries? They will be removed from your published content but kept as drafts.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex sm:justify-end gap-2 mt-5">
            <Button
              variant="outline"
              onClick={() => setIsUnpublishDialogOpen(false)}
              disabled={isLoading}
              className="sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleUnpublishEntries}
              disabled={isLoading}
              className="sm:w-auto gap-2 bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                  <span>Unpublishing...</span>
                </>
              ) : (
                <>
                  <RotateCcw size={16} />
                  <span>Unpublish {selectedCount === 1 ? 'Entry' : 'Entries'}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
