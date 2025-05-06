import React, { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ContentTable } from "@/components/content-table"
import { EntryProps } from 'contentful-management';
import { ChevronDown, ChevronUp } from "lucide-react";

interface ContentEntryTabsProps {
  scheduledContent: any[];
  recentlyPublishedContent: any[];
  needsUpdateContent: any[];
  orphanedContent: any[];
  userCache: Record<string, string>;
  onResolveUser: (userId: string) => Promise<string>;
  onOpenEntry?: (entryId: string) => void;
  needsUpdateMonths?: number;
}

interface TransformedEntry {
  id: string;
  title: string;
  author: string;
  status: string;
  workflow: string;
  stage: string;
  date: string;
  isShowMoreRow?: boolean;
  contentType: string;
  needsUpdate?: boolean;
}

const getEntryTitle = (entry: EntryProps): string => {
  // Try to find the first field that could be a title
  const titleFields = ['title', 'name', 'heading', 'internalName'];
  const fields = entry.fields || {};
  

  
  for (const fieldName of titleFields) {
    const field = fields[fieldName];
    if (field) {
      // If the field is directly a string, use it
      if (typeof field === 'string') return field;
      
      // If it's a localized field
      if (typeof field === 'object') {
        // Try different locale patterns
        const value = 
          field['en-US'] || // Standard Contentful locale
          field['en'] ||    // Shortened locale
          field['default'] || // Default locale
          (typeof field === 'object' && Object.values(field)[0]); // First available locale
          
        if (value) {
          // If the value is an object (like a reference), try to get its title or name
          if (typeof value === 'object' && value !== null) {
            return value.title || value.name || JSON.stringify(value);
          }
          return value;
        }
      }
    }
  }
  
  // If no title field is found, try to get any string field as a fallback
  for (const [fieldName, field] of Object.entries(fields)) {
    if (field && typeof field === 'object') {
      const value = field['en-US'] || field['en'] || Object.values(field)[0];
      if (typeof value === 'string') {
        return `${fieldName}: ${value}`;
      }
    }
  }
  
  // Log when we can't find a title
  console.log('Could not find title for entry:', entry.sys.id);
  return `Untitled (${entry.sys.contentType?.sys.id || 'Unknown Type'})`;
};

export const ContentEntryTabs: React.FC<ContentEntryTabsProps> = ({
  scheduledContent,
  recentlyPublishedContent,
  needsUpdateContent,
  orphanedContent,
  userCache,
  onResolveUser,
  onOpenEntry,
  needsUpdateMonths = 6,
}) => {
  const [transformedData, setTransformedData] = useState<{
    scheduled: TransformedEntry[];
    published: TransformedEntry[];
    update: TransformedEntry[];
    orphaned: TransformedEntry[];
  }>({
    scheduled: [],
    published: [],
    update: [],
    orphaned: [],
  });

  const [showMore, setShowMore] = useState<{
    scheduled: boolean;
    published: boolean;
    update: boolean;
    orphaned: boolean;
  }>({
    scheduled: false,
    published: false,
    update: false,
    orphaned: false,
  });

  useEffect(() => {
    const transformEntries = async (entries: EntryProps[]) => {
      const transformed = await Promise.all(entries.map(async (entry) => {
        const userId = entry.sys.createdBy?.sys.id || 'Unknown';
        let authorName = userCache[userId];
        
        if (!authorName && userId !== 'Unknown') {
          authorName = await onResolveUser(userId);
        }
        
        const title = getEntryTitle(entry);
        
        return {
          id: entry.sys.id,
          title,
          author: authorName || userId,
          status: entry.sys.publishedAt ? 'Published' : 'Draft',
          workflow: entry.sys.contentType?.sys.id || 'Unknown',
          stage: entry.sys.publishedVersion ? 'Published' : 'Draft',
          date: entry.sys.publishedAt || entry.sys.createdAt,
          contentType: entry.sys.contentType?.sys.id || 'Unknown',
        };
      }));
      return transformed;
    };

    const updateTransformedData = async () => {
      const scheduled = await transformEntries(scheduledContent);
      const published = await transformEntries(recentlyPublishedContent);
      
      // Mark entries that need updates with the needsUpdate flag
      const update = await transformEntries(needsUpdateContent);
      const updateWithFlag = update.map(entry => ({
        ...entry,
        needsUpdate: true
      }));
      
      const orphaned = await transformEntries(orphanedContent);

      setTransformedData({
        scheduled,
        published,
        update: updateWithFlag,
        orphaned,
      });
    };

    updateTransformedData();
  }, [scheduledContent, recentlyPublishedContent, needsUpdateContent, orphanedContent, userCache, onResolveUser]);

  const getDisplayData = (data: TransformedEntry[], type: 'scheduled' | 'published' | 'update' | 'orphaned') => {
    // Pre-sort the data depending on the type
    let sortedData = [...data];
    
    if (type === 'update') {
      // Needs Update: Sort by oldest published date first (ascending)
      sortedData.sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime());
    } else {
      // Other tabs: Sort by newest first (descending)
      sortedData.sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());
    }
    
    const limit = showMore[type] ? 20 : 5;
    const displayData = sortedData.slice(0, limit);
    
    // If we have more than 5 items, add the show more/less row
    if (sortedData.length > 5) {
      const showMoreContent = (
        <div 
          className="flex items-center justify-center w-full gap-2 text-muted-foreground hover:text-foreground cursor-pointer py-2" 
          onClick={() => setShowMore(prev => ({ ...prev, [type]: !prev[type] }))}>
          {showMore[type] ? (
            <>Show Less <ChevronUp className="h-4 w-4" /></>
          ) : (
            <>Show More <ChevronDown className="h-4 w-4" /></>
          )}
        </div>
      );

      displayData.push({
        id: 'show-more',
        title: showMoreContent,
        author: '',
        status: '',
        workflow: '',
        stage: '',
        date: '',
        isShowMoreRow: true
      } as any);
    }
    
    return displayData;
  };

  return (
    <Tabs defaultValue="scheduled">
      <TabsList>
        <TabsTrigger value="scheduled">Scheduled Content</TabsTrigger>
        <TabsTrigger value="published">Recently Published</TabsTrigger>
        <TabsTrigger value="update">Needs Update</TabsTrigger>
        <TabsTrigger value="orphaned">Orphaned Content</TabsTrigger>
      </TabsList>
      <TabsContent value="scheduled" className="space-y-4">
        <ContentTable
          title="Upcoming Scheduled Content"
          data={getDisplayData(transformedData.scheduled, 'scheduled')}
          showStage={true}
          onEntryClick={onOpenEntry}
          hideActions={true}
        />
      </TabsContent>
      <TabsContent value="published" className="space-y-4">
        <ContentTable
          title="Recently Published Content"
          data={getDisplayData(transformedData.published, 'published')}
          showStage={false}
          onEntryClick={onOpenEntry}
          hideActions={true}
        />
      </TabsContent>
      <TabsContent value="update" className="space-y-4">
        <ContentTable
          title={`Content Needing Updates`}
          description={`Content that hasn't been updated in more than ${needsUpdateMonths} ${needsUpdateMonths === 1 ? 'month' : 'months'}`}
          data={getDisplayData(transformedData.update, 'update')}
          showStage={false}
          onEntryClick={onOpenEntry}
          hideActions={true}
        />
      </TabsContent>
      <TabsContent value="orphaned" className="space-y-4">
        <ContentTable
          title="Content that is not referenced"
          description={
            "Entries that are not linked by any other content. " +
            (localStorage.getItem('contentDashboardConfig') ? 
              `Some content types are excluded from this view based on your configuration.` : 
              "No content types are currently excluded from this view.")
          }
          data={getDisplayData(transformedData.orphaned, 'orphaned')}
          showStage={false}
          onEntryClick={onOpenEntry}
          hideActions={true}
        />
      </TabsContent>
    </Tabs>
  );
}; 