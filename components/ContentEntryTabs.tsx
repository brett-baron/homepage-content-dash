import React, { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ContentTable } from "@/components/content-table"
import { EntryProps } from 'contentful-management';
import { ChevronDown, ChevronUp } from "lucide-react";

interface ContentEntryTabsProps {
  scheduledContent: any[];
  recentlyPublishedContent: any[];
  needsUpdateContent: any[];
  userCache: Record<string, string>;
  onResolveUser: (userId: string) => Promise<string>;
  onOpenEntry?: (entryId: string) => void;
  needsUpdateMonths?: number;
  recentlyPublishedDays?: number;
}

interface TransformedEntry {
  id: string;
  title: string;
  author: string; // Keep as 'author' for internal consistency with existing code
  status: string;
  workflow: string;
  stage: string;
  date: string;
  isShowMoreRow?: boolean;
  contentType: string;
  needsUpdate?: boolean;
  age?: number; // Age in days
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
  userCache,
  onResolveUser,
  onOpenEntry,
  needsUpdateMonths = 6,
  recentlyPublishedDays = 7,
}) => {
  const [transformedData, setTransformedData] = useState<{
    scheduled: TransformedEntry[];
    published: TransformedEntry[];
    update: TransformedEntry[];
  }>({
    scheduled: [],
    published: [],
    update: [],
  });

  const [showMore, setShowMore] = useState<{
    scheduled: boolean;
    published: boolean;
    update: boolean;
  }>({
    scheduled: false,
    published: false,
    update: false,
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
        const publishDate = entry.sys.publishedAt || entry.sys.createdAt;
        const age = publishDate ? Math.floor((new Date().getTime() - new Date(publishDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
        
        return {
          id: entry.sys.id,
          title,
          author: authorName || userId,
          status: entry.sys.publishedAt ? 'Published' : 'Draft',
          workflow: entry.sys.contentType?.sys.id || 'Unknown',
          stage: entry.sys.publishedVersion ? 'Published' : 'Draft',
          date: publishDate,
          contentType: entry.sys.contentType?.sys.id || 'Unknown',
          age
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

      setTransformedData({
        scheduled,
        published,
        update: updateWithFlag,
      });
    };

    updateTransformedData();
  }, [scheduledContent, recentlyPublishedContent, needsUpdateContent, onResolveUser]);

  const getDisplayData = (data: TransformedEntry[], type: 'scheduled' | 'published' | 'update') => {
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
          description={`Content published in the last ${recentlyPublishedDays} ${recentlyPublishedDays === 1 ? 'day' : 'days'}`}
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
          showAge={true}
        />
      </TabsContent>
    </Tabs>
  );
}; 