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
  };
};

export const getContentStats = async (entries: CollectionProp<EntryProps>, actions: any[]): Promise<ContentStats> => {
  const now = new Date();
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

  // Calculate percent change (comparing current month to previous month)
  const thisMonthPublished = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate >= thirtyDaysAgo;
  }).length;

  console.log('This month published:', thisMonthPublished);

  const previousMonthStart = new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000);
  const previousMonthPublished = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate >= previousMonthStart && publishDate < thirtyDaysAgo;
  }).length;

  console.log('Previous month published:', previousMonthPublished);

  const percentChange = previousMonthPublished === 0 
    ? 0
    : ((thisMonthPublished - previousMonthPublished) / previousMonthPublished) * 100;

  // Get scheduled count (only count 'scheduled' status actions)
  console.log('Processing scheduled actions:', actions?.length);
  console.log('Sample action:', actions?.[0]);

  const scheduledCount = actions?.filter((action: ScheduledAction) => {
    // Only count actions that:
    // 1. Have status 'scheduled'
    // 2. Are scheduled for the future
    // 3. Are publish actions
    return action.sys.status === 'scheduled' && 
           new Date(action.scheduledFor.datetime) > now &&
           action.action === 'publish';
  }).length ?? 0;

  console.log('Scheduled count:', scheduledCount);

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