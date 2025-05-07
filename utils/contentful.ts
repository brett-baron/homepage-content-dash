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

export const getContentStats = async (
  entries: CollectionProp<EntryProps>, 
  actions: any[],
  recentlyPublishedDays: number = 7,
  needsUpdateMonths: number = 6
): Promise<ContentStats> => {
  const now = new Date();
  console.log('Current date:', now.toISOString());
  
  // Calculate the start of the current and previous months for more accurate monthly comparisons
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  
  console.log('Current month start:', currentMonth.toISOString());
  console.log('Previous month start:', previousMonth.toISOString());
  console.log('Two months ago start:', twoMonthsAgo.toISOString());
  
  // For other calculations (configured days, needs update months)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentlyPublishedDate = new Date(now.getTime() - recentlyPublishedDays * 24 * 60 * 60 * 1000);
  const needsUpdateDate = new Date(now.getTime() - needsUpdateMonths * 30 * 24 * 60 * 60 * 1000);

  console.log(`Recently published threshold (${recentlyPublishedDays} days):`, recentlyPublishedDate.toISOString());
  console.log(`Needs update threshold (${needsUpdateMonths} months):`, needsUpdateDate.toISOString());
  
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

  // Calculate entries first published in current month and previous month
  const thisMonthPublished = publishedEntries.filter((entry: ContentfulEntry) => {
    const firstPublishDate = new Date(entry.sys.firstPublishedAt!);
    return firstPublishDate >= currentMonth;
  }).length;

  console.log('This month first published:', thisMonthPublished);
  
  // Log a few sample entries from this month for debugging
  const thisMonthEntries = publishedEntries.filter((entry: ContentfulEntry) => {
    const firstPublishDate = new Date(entry.sys.firstPublishedAt!);
    return firstPublishDate >= currentMonth;
  }).slice(0, 3);
  
  console.log('Sample entries first published this month:');
  thisMonthEntries.forEach((entry, i) => {
    console.log(`Entry ${i+1}: First published at ${entry.sys.firstPublishedAt}, Title: ${entry.fields?.title?.['en-US'] || 'Untitled'}`);
  });

  const previousMonthPublished = publishedEntries.filter((entry: ContentfulEntry) => {
    const firstPublishDate = new Date(entry.sys.firstPublishedAt!);
    return firstPublishDate >= previousMonth && firstPublishDate < currentMonth;
  }).length;

  console.log('Previous month first published:', previousMonthPublished);
  
  // Log a few sample entries from previous month for debugging
  const previousMonthEntries = publishedEntries.filter((entry: ContentfulEntry) => {
    const firstPublishDate = new Date(entry.sys.firstPublishedAt!);
    return firstPublishDate >= previousMonth && firstPublishDate < currentMonth;
  }).slice(0, 3);
  
  console.log('Sample entries first published last month:');
  previousMonthEntries.forEach((entry, i) => {
    console.log(`Entry ${i+1}: First published at ${entry.sys.firstPublishedAt}, Title: ${entry.fields?.title?.['en-US'] || 'Untitled'}`);
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

  // Get recently published count (based on configured days)
  const recentlyPublishedCount = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate >= recentlyPublishedDate;
  }).length;

  console.log(`Recently published count (last ${recentlyPublishedDays} days):`, recentlyPublishedCount);

  // Get needs update count (published more than configured months ago)
  const needsUpdateCount = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate <= needsUpdateDate;
  }).length;

  console.log(`Needs update count (older than ${needsUpdateMonths} months):`, needsUpdateCount);

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
export const generateChartData = (entries: CollectionProp<EntryProps>): Array<{ date: string; count: number; percentChange?: number }> => {
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
    
    // Use the earlier of our known min date or the actual oldest date
    if (oldestDate < minDate) {
      minDate.setTime(oldestDate.getTime());
      minDate.setDate(1); // Set to first of the month
      console.log(`Using detected oldest date for chart: ${minDate.toISOString()}`);
    }
  }
  
  // Create array of all months from min date to current date
  const months: Array<{ date: string; count: number }> = [];
  const currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
  let monthDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  
  while (monthDate <= currentDate) {
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`;
    const existingCount = entriesByMonth[monthKey] || 0;
    
    months.push({
      date: monthKey,
      count: existingCount
    });
    
    // Advance to next month
    monthDate.setMonth(monthDate.getMonth() + 1);
  }
  
  // Calculate month-over-month percent changes
  const monthsWithPercentChange = months.map((month, index, array) => {
    if (index === 0) {
      return { ...month, percentChange: 0 };
    }
    
    const prevCount = array[index - 1].count;
    let percentChange = 0;
    
    if (prevCount > 0) {
      percentChange = ((month.count - prevCount) / prevCount) * 100;
    } else if (month.count > 0) {
      percentChange = 100; // If previous month had 0, and this month has value, show 100% increase
    }
    
    return { ...month, percentChange };
  });
  
  return monthsWithPercentChange;
};

// Generate chart data showing updated dates (any content updates)
export const generateUpdatedChartData = (entries: CollectionProp<EntryProps>): Array<{ date: string; count: number; percentChange?: number }> => {
  // Get published entries
  const publishedEntries = entries.items.filter((entry: ContentfulEntry) => {
    return entry.sys.updatedAt;
  });

  console.log(`Found ${publishedEntries.length} updated entries for chart data`);
  
  // Group entries by month
  const entriesByMonth: Record<string, number> = {};
  
  // Define the oldest date
  let oldestUpdateDate: string | null = null;

  publishedEntries.forEach((entry: ContentfulEntry) => {
    if (entry.sys.updatedAt) {
      const updateDate = new Date(entry.sys.updatedAt);
      
      // Track the oldest date as a string for simple comparison
      if (!oldestUpdateDate || entry.sys.updatedAt < oldestUpdateDate) {
        oldestUpdateDate = entry.sys.updatedAt;
      }
      
      // Format as YYYY-MM-01 to group by month
      const monthKey = `${updateDate.getFullYear()}-${String(updateDate.getMonth() + 1).padStart(2, '0')}-01`;
      
      entriesByMonth[monthKey] = (entriesByMonth[monthKey] || 0) + 1;
    }
  });

  // Make sure we have a date range to work with
  const now = new Date();
  // June 11, 2024 is known to be the oldest content update date
  const minDate = new Date(2024, 5, 1); // June 1, 2024 (zero-indexed month)
  
  console.log(`Minimum date for chart: ${minDate.toISOString()} (June 1, 2024)`);
  
  // Convert the oldest update date to a Date object
  let oldestDate: Date | null = null;
  if (oldestUpdateDate) {
    oldestDate = new Date(oldestUpdateDate);
    console.log(`Oldest content update date detected: ${oldestDate.toISOString()}`);
    
    // Use the earlier of our known min date or the actual oldest date
    if (oldestDate < minDate) {
      minDate.setTime(oldestDate.getTime());
      minDate.setDate(1); // Set to first of the month
      console.log(`Using detected oldest date for chart: ${minDate.toISOString()}`);
    }
  }
  
  // Create array of all months from min date to current date
  const months: Array<{ date: string; count: number }> = [];
  const currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
  let monthDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  
  while (monthDate <= currentDate) {
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`;
    const existingCount = entriesByMonth[monthKey] || 0;
    
    months.push({
      date: monthKey,
      count: existingCount
    });
    
    // Advance to next month
    monthDate.setMonth(monthDate.getMonth() + 1);
  }
  
  // Calculate month-over-month percent changes
  const monthsWithPercentChange = months.map((month, index, array) => {
    if (index === 0) {
      return { ...month, percentChange: 0 };
    }
    
    const prevCount = array[index - 1].count;
    let percentChange = 0;
    
    if (prevCount > 0) {
      percentChange = ((month.count - prevCount) / prevCount) * 100;
    } else if (month.count > 0) {
      percentChange = 100; // If previous month had 0, and this month has value, show 100% increase
    }
    
    return { ...month, percentChange };
  });
  
  return monthsWithPercentChange;
}; 