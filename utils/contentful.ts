import { CollectionProp, Entry, EntryProps } from 'contentful-management';

interface ScheduledAction {
  sys: {
    type: string;
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  scheduledFor: {
    datetime: string;
    timezone: string;
  };
  action: string;
  entity: {
    sys: {
      type: string;
      linkType: string;
      id: string;
    };
  };
  release?: {
    entities: {
      items: Array<{
        sys: {
          id: string;
          type: string;
        };
      }>;
    };
  };
}

interface ContentStats {
  totalPublished: number;
  percentChange: number;
  scheduledCount: number;
  recentlyPublishedCount: number;
  needsUpdateCount: number;
  previousMonthPublished: number;
}

type ContentfulEntry = EntryProps & {
  sys: EntryProps['sys'] & {
    publishedAt?: string;
    firstPublishedAt?: string;
  };
};

export const getContentStats = async (entries: CollectionProp<EntryProps>, actions: any[]): Promise<ContentStats> => {
  const now = new Date();
  console.log('Current date:', now.toISOString());
  
  // Calculate the start of the current and previous months for more accurate monthly comparisons
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  
  console.log('Current month start:', currentMonth.toISOString());
  console.log('Previous month start:', previousMonth.toISOString());
  console.log('Two months ago start:', twoMonthsAgo.toISOString());
  
  // For other calculations (7 days, 6 months)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  console.log('Processing entries:', entries.items.length);
  console.log('Sample entry sys:', entries.items[0]?.sys);

  // Get published entries
  const publishedEntries = entries.items.filter((entry: ContentfulEntry) => {
    console.log('Entry publish date:', entry.sys.publishedAt);
    return entry.sys.publishedAt;
  });

  console.log('Published entries:', publishedEntries.length);

  // Calculate total published
  const totalPublished = publishedEntries.length;

  // Calculate entries published in current month and previous month
  const thisMonthPublished = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate >= currentMonth;
  }).length;

  console.log('This month published:', thisMonthPublished);
  
  // Log a few sample entries from this month for debugging
  const thisMonthEntries = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate >= currentMonth;
  }).slice(0, 3);
  
  console.log('Sample entries published this month:');
  thisMonthEntries.forEach((entry, i) => {
    console.log(`Entry ${i+1}: Published at ${entry.sys.publishedAt}, Title: ${entry.fields?.title?.['en-US'] || 'Untitled'}`);
  });

  const previousMonthPublished = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate >= previousMonth && publishDate < currentMonth;
  }).length;

  console.log('Previous month published:', previousMonthPublished);
  
  // Log a few sample entries from previous month for debugging
  const previousMonthEntries = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate >= previousMonth && publishDate < currentMonth;
  }).slice(0, 3);
  
  console.log('Sample entries published last month:');
  previousMonthEntries.forEach((entry, i) => {
    console.log(`Entry ${i+1}: Published at ${entry.sys.publishedAt}, Title: ${entry.fields?.title?.['en-US'] || 'Untitled'}`);
  });

  // Even if previousMonthPublished is 0, if we have content published this month
  // we should still show a percentage increase
  let percentChange = 0;
  if (previousMonthPublished > 0) {
    percentChange = ((thisMonthPublished - previousMonthPublished) / previousMonthPublished) * 100;
  } else if (thisMonthPublished > 0) {
    percentChange = 100; // If nothing published last month but we have content this month, show 100% increase
  }

  // Get scheduled count - including both individual entries and entries in releases
  console.log('Processing scheduled actions:', actions?.length);
  console.log('Sample action:', actions?.[0]);

  // Track unique entry IDs that are scheduled
  const scheduledEntryIds = new Set<string>();

  actions?.forEach((action: ScheduledAction) => {
    // Only process actions that:
    // 1. Have status 'scheduled'
    // 2. Are scheduled for the future
    // 3. Are publish actions
    if (action.sys.status === 'scheduled' && 
        new Date(action.scheduledFor.datetime) > now &&
        action.action === 'publish') {
      
      if (action.entity.sys.linkType === 'Entry') {
        // Individual scheduled entry
        scheduledEntryIds.add(action.entity.sys.id);
      } else if (action.entity.sys.linkType === 'Release') {
        // For releases, we need to add all entries that are part of the release
        // The entries should be available in the release entities
        const releaseEntities = action.release?.entities?.items || [];
        releaseEntities.forEach((entity: any) => {
          if (entity.sys?.id) {
            scheduledEntryIds.add(entity.sys.id);
          }
        });
      }
    }
  });

  const scheduledCount = scheduledEntryIds.size;
  console.log('Total scheduled entries:', scheduledCount);

  // Get recently published count (last 7 days)
  const recentlyPublishedCount = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate >= sevenDaysAgo;
  }).length;

  console.log('Recently published count:', recentlyPublishedCount);

  // Get needs update count (published more than 6 months ago)
  const needsUpdateCount = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate <= sixMonthsAgo;
  }).length;

  console.log('Needs update count:', needsUpdateCount);

  return {
    totalPublished,
    percentChange,
    scheduledCount,
    recentlyPublishedCount,
    needsUpdateCount,
    previousMonthPublished,
  };
};

// Generate chart data showing first published dates (new content)
export const generateChartData = (entries: CollectionProp<EntryProps>): Array<{ date: string; count: number }> => {
  // Get published entries
  const publishedEntries = entries.items.filter((entry: ContentfulEntry) => {
    return entry.sys.firstPublishedAt;
  });

  console.log(`Found ${publishedEntries.length} published entries for chart data`);
  
  // Log the first few publish dates to verify the data
  const sampleEntries = publishedEntries.slice(0, 5);
  console.log('Sample publish dates (first 5):');
  sampleEntries.forEach((entry: ContentfulEntry, index) => {
    console.log(`  ${index + 1}. Raw: ${entry.sys.firstPublishedAt}`);
    const date = new Date(entry.sys.firstPublishedAt!);
    console.log(`     Parsed: ${date.toISOString()}`);
    console.log(`     Year: ${date.getFullYear()}, Month: ${date.getMonth() + 1}`);
  });

  // Group entries by month
  const entriesByMonth: Record<string, number> = {};
  
  // Define the oldest date
  let oldestPublishDate: string | null = null;

  publishedEntries.forEach((entry: ContentfulEntry) => {
    if (entry.sys.firstPublishedAt) {
      const publishDate = new Date(entry.sys.firstPublishedAt);
      
      // Track the oldest date as a string for simple comparison
      if (!oldestPublishDate || entry.sys.firstPublishedAt < oldestPublishDate) {
        oldestPublishDate = entry.sys.firstPublishedAt;
      }
      
      // Format as YYYY-MM-01 to group by month
      const monthKey = `${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}-01`;
      
      entriesByMonth[monthKey] = (entriesByMonth[monthKey] || 0) + 1;
    }
  });

  // Log month groupings
  console.log('Entries grouped by month:');
  Object.entries(entriesByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([month, count]) => {
      console.log(`  ${month}: ${count} entries`);
    });

  // Make sure we have a date range to work with
  const now = new Date();
  // June 11, 2024 is known to be the oldest content publish date
  const minDate = new Date(2024, 5, 1); // June 1, 2024 (zero-indexed month)
  
  console.log(`Minimum date for chart: ${minDate.toISOString()} (June 1, 2024)`);
  
  // Convert the oldest publish date to a Date object
  let oldestDate: Date | null = null;
  if (oldestPublishDate) {
    oldestDate = new Date(oldestPublishDate);
    console.log(`Oldest content publish date detected: ${oldestDate.toISOString()}`);
  }
  
  // Find the starting date for our chart
  let startDate: Date;
  if (oldestDate && oldestDate < minDate) {
    startDate = new Date(oldestDate);
    console.log(`Using oldest content date as start date: ${startDate.toISOString()}`);
  } else {
    startDate = new Date(minDate);
    console.log(`Using minimum date (June 2024) as start date: ${startDate.toISOString()}`);
  }
  
  const endDate = new Date(now);
  console.log(`End date for chart (current date): ${endDate.toISOString()}`);
  
  // Set both dates to first day of their respective months
  startDate.setDate(1);
  endDate.setDate(1);
  
  console.log(`Adjusted start date (first of month): ${startDate.toISOString()}`);
  console.log(`Adjusted end date (first of month): ${endDate.toISOString()}`);
  
  // Create a complete array of months from start to end date
  const completeData: Array<{ date: string; count: number }> = [];
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;
    
    completeData.push({
      date: monthKey,
      count: entriesByMonth[monthKey] || 0
    });
    
    // Move to next month
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  
  // Log out the chart data for debugging
  console.log('Chart data details:');
  console.log('Oldest publish date string:', oldestPublishDate);
  console.log('Oldest publish date:', oldestDate ? oldestDate.toISOString() : 'none');
  console.log('Range start date:', startDate.toISOString());
  console.log('Range end date:', endDate.toISOString());
  console.log('Generated data points:', completeData.length);
  
  // For detailed logging of chart data
  console.log('Final chart data points:');
  completeData.forEach(point => {
    // Manually parse the date string to ensure correct month display
    const [year, month] = point.date.split('-');
    // Subtract 1 from month when creating Date because JS months are 0-indexed
    const pointDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    
    console.log(`  ${point.date} (${pointDate.toLocaleString('en-US', { month: 'short', year: 'numeric' })}): ${point.count} entries`);
    // Log raw month values to debug
    console.log(`    Raw month value: ${month}, JS Date month: ${pointDate.getMonth() + 1}`);
  });
  
  return completeData;
};

// Generate chart data showing latest published dates (updated content)
export const generateUpdatedChartData = (entries: CollectionProp<EntryProps>): Array<{ date: string; count: number }> => {
  // Get published entries
  const publishedEntries = entries.items.filter((entry: ContentfulEntry) => {
    return entry.sys.publishedAt;
  });

  console.log(`Found ${publishedEntries.length} published entries for updated chart data`);
  
  // Log the first few publish dates to verify the data
  const sampleEntries = publishedEntries.slice(0, 5);
  console.log('Sample publishedAt dates (first 5):');
  sampleEntries.forEach((entry: ContentfulEntry, index) => {
    console.log(`  ${index + 1}. Raw: ${entry.sys.publishedAt}`);
    const date = new Date(entry.sys.publishedAt!);
    console.log(`     Parsed: ${date.toISOString()}`);
    console.log(`     Year: ${date.getFullYear()}, Month: ${date.getMonth() + 1}`);
  });

  // Group entries by month
  const entriesByMonth: Record<string, number> = {};
  
  // Define the oldest date
  let oldestPublishDate: string | null = null;

  publishedEntries.forEach((entry: ContentfulEntry) => {
    if (entry.sys.publishedAt) {
      const publishDate = new Date(entry.sys.publishedAt);
      
      // Track the oldest date as a string for simple comparison
      if (!oldestPublishDate || entry.sys.publishedAt < oldestPublishDate) {
        oldestPublishDate = entry.sys.publishedAt;
      }
      
      // Format as YYYY-MM-01 to group by month
      const monthKey = `${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}-01`;
      
      entriesByMonth[monthKey] = (entriesByMonth[monthKey] || 0) + 1;
    }
  });

  // Make sure we have a date range to work with
  const now = new Date();
  // June 11, 2024 is known to be the oldest content publish date
  const minDate = new Date(2024, 5, 1); // June 1, 2024 (zero-indexed month)
  
  // Convert the oldest publish date to a Date object
  let oldestDate: Date | null = null;
  if (oldestPublishDate) {
    oldestDate = new Date(oldestPublishDate);
  }
  
  // Find the starting date for our chart
  let startDate: Date;
  if (oldestDate && oldestDate < minDate) {
    startDate = new Date(oldestDate);
  } else {
    startDate = new Date(minDate);
  }
  
  const endDate = new Date(now);
  
  // Set both dates to first day of their respective months
  startDate.setDate(1);
  endDate.setDate(1);
  
  // Create a complete array of months from start to end date
  const completeData: Array<{ date: string; count: number }> = [];
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;
    
    completeData.push({
      date: monthKey,
      count: entriesByMonth[monthKey] || 0
    });
    
    // Move to next month
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  
  return completeData;
}; 