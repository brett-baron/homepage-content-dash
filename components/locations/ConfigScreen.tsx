import React, { useCallback, useState, useEffect } from 'react';
import { ConfigAppSDK } from '@contentful/app-sdk';
import { Heading, Form, Flex, FormControl, Spinner, Select, Switch } from '@contentful/f36-components';
import { Multiselect } from '@contentful/f36-multiselect';
import { css } from 'emotion';
import { useCMA, useSDK } from '@contentful/react-apps-toolkit';

export interface AppInstallationParameters {
  trackedContentTypes?: string[];
  needsUpdateMonths?: number;
  defaultTimeRange?: 'all' | 'year' | '6months';
  recentlyPublishedDays?: number;
  showUpcomingReleases?: boolean;
  timeToPublishDays?: number;
}

const ConfigScreen = () => {
  const [parameters, setParameters] = useState<AppInstallationParameters>({
    trackedContentTypes: [],
    needsUpdateMonths: 6,
    defaultTimeRange: 'year',
    recentlyPublishedDays: 7,
    showUpcomingReleases: true,
    timeToPublishDays: 30
  });
  const [contentTypes, setContentTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [filteredContentTypes, setFilteredContentTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const sdk = useSDK<ConfigAppSDK>();
  const cma = useCMA();

  const onConfigure = useCallback(async () => {
    // This method will be called when a user clicks on "Install"
    // or "Save" in the configuration screen.
    
    // Store the configuration in localStorage for the Home component to access
    localStorage.setItem('contentDashboardConfig', JSON.stringify(parameters));
    console.log('Saved configuration to localStorage:', parameters);
    
    // Get current the state of EditorInterface and other entities
    // related to this app installation
    const currentState = await sdk.app.getCurrentState();

    return {
      // Parameters to be persisted as the app configuration.
      parameters,
      // In case you don't want to submit any update to app
      // locations, you can just pass the currentState as is
      targetState: currentState,
    };
  }, [parameters, sdk]);

  useEffect(() => {
    // `onConfigure` allows to configure a callback to be
    // invoked when a user attempts to install the app or update
    // its configuration.
    sdk.app.onConfigure(() => onConfigure());
  }, [sdk, onConfigure]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        // Get content types to populate the tracking list
        const contentTypesResponse = await cma.contentType.getMany({
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment
        });
        
        const sortedContentTypes = contentTypesResponse.items
          .map(ct => ({ 
            id: ct.sys.id, 
            name: ct.name 
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        
        console.log('Available content types:', sortedContentTypes.map(ct => ct.id));
        setContentTypes(sortedContentTypes);
        setFilteredContentTypes(sortedContentTypes);
        
        // Try to get the configuration from localStorage first
        const storedConfig = localStorage.getItem('contentDashboardConfig');
        if (storedConfig) {
          try {
            const parsedConfig = JSON.parse(storedConfig) as AppInstallationParameters;
            if (parsedConfig) {
              console.log('Config from localStorage:', parsedConfig);
              
              // Filter out content types that don't exist
              if (parsedConfig.trackedContentTypes) {
                const validTrackedTypes = parsedConfig.trackedContentTypes.filter(id => 
                  sortedContentTypes.some(ct => ct.id === id)
                );
                
                if (validTrackedTypes.length !== parsedConfig.trackedContentTypes.length) {
                  console.warn('Some tracked content types were filtered out because they do not exist:', 
                    parsedConfig.trackedContentTypes.filter(id => !sortedContentTypes.some(ct => ct.id === id))
                  );
                  parsedConfig.trackedContentTypes = validTrackedTypes;
                }
              }
              
              // Ensure we have valid values or defaults
              parsedConfig.needsUpdateMonths = parsedConfig.needsUpdateMonths || 6;
              parsedConfig.defaultTimeRange = parsedConfig.defaultTimeRange || 'year';
              parsedConfig.recentlyPublishedDays = parsedConfig.recentlyPublishedDays || 7;
              parsedConfig.showUpcomingReleases = parsedConfig.showUpcomingReleases ?? true;
              parsedConfig.timeToPublishDays = parsedConfig.timeToPublishDays || 30;
              
              setParameters(parsedConfig);
              console.log('Loaded and filtered configuration from localStorage:', parsedConfig);
              setIsLoading(false);
              sdk.app.setReady();
              return;
            }
          } catch (e) {
            console.error('Error parsing stored config:', e);
          }
        }
        
        // Get current parameters of the app from SDK if localStorage wasn't available
        const currentParameters: AppInstallationParameters | null = await sdk.app.getParameters();

        if (currentParameters) {
          // Ensure default values if not set
          currentParameters.needsUpdateMonths = currentParameters.needsUpdateMonths || 6;
          currentParameters.defaultTimeRange = currentParameters.defaultTimeRange || 'year';
          currentParameters.recentlyPublishedDays = currentParameters.recentlyPublishedDays || 7;
          currentParameters.showUpcomingReleases = currentParameters.showUpcomingReleases ?? true;
          currentParameters.timeToPublishDays = currentParameters.timeToPublishDays || 30;
          
          setParameters(currentParameters);
        } else {
          // Initialize with defaults if no parameters exist
          setParameters({ 
            trackedContentTypes: [],
            needsUpdateMonths: 6,
            defaultTimeRange: 'year',
            recentlyPublishedDays: 7,
            showUpcomingReleases: true,
            timeToPublishDays: 30
          });
        }
      } catch (error) {
        console.error('Error loading content types:', error);
      } finally {
        setIsLoading(false);
        sdk.app.setReady();
      }
    })();
  }, [sdk, cma]);

  const handleSearchValueChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const searchValue = event.target.value.toLowerCase();
    if (searchValue === '') {
      setFilteredContentTypes(contentTypes);
    } else {
      const filtered = contentTypes.filter(
        ct => ct.name.toLowerCase().includes(searchValue) || ct.id.toLowerCase().includes(searchValue)
      );
      setFilteredContentTypes(filtered);
    }
  };

  const handleTrackedContentTypeSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { checked, value } = event.target;
    console.log(`Tracked content type selection changed: ${value} - ${checked ? 'checked' : 'unchecked'}`);

    setParameters(prev => {
      const trackedContentTypes = prev.trackedContentTypes || [];

      if (checked) {
        // Add to tracked types
        return {
          ...prev,
          trackedContentTypes: [...trackedContentTypes, value]
        };
      } else {
        // Remove from tracked types
        return {
          ...prev,
          trackedContentTypes: trackedContentTypes.filter(id => id !== value)
        };
      }
    });
  };

  const handleNeedsUpdateMonthsChange = (value: string) => {
    const months = parseInt(value, 10);
    console.log(`Needs update months changed to: ${months}`);
    
    setParameters(prev => ({
      ...prev,
      needsUpdateMonths: months
    }));
  };

  const handleDefaultTimeRangeChange = (value: string) => {
    console.log(`Default time range changed to: ${value}`);
    
    setParameters(prev => ({
      ...prev,
      defaultTimeRange: value as 'all' | 'year' | '6months'
    }));
  };

  const handleRecentlyPublishedDaysChange = (value: string) => {
    const days = parseInt(value, 10);
    console.log(`Recently published days changed to: ${days}`);
    
    setParameters(prev => ({
      ...prev,
      recentlyPublishedDays: days
    }));
  };

  const handleShowUpcomingReleasesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    console.log(`Show upcoming releases changed to: ${checked}`);
    
    setParameters(prev => ({
      ...prev,
      showUpcomingReleases: checked
    }));
  };

  const handleTimeToPublishDaysChange = (value: string) => {
    const days = parseInt(value, 10);
    console.log(`Time to publish days changed to: ${days}`);
    
    setParameters(prev => ({
      ...prev,
      timeToPublishDays: days
    }));
  };

  return (
    <Flex flexDirection="column" className={css({ margin: '40px', maxWidth: '800px' })}>
      <Form>
        <Heading>Content Dashboard Configuration</Heading>
        
        {isLoading ? (
          <Flex justifyContent="center" margin="spacingL">
            <Spinner />
          </Flex>
        ) : (
          <>
            <FormControl marginBottom="spacingL">
              <FormControl.Label>Content &quot;Needs Update&quot; Time Threshold</FormControl.Label>
              <Select
                id="needs-update-months"
                name="needs-update-months"
                value={parameters.needsUpdateMonths?.toString() || "6"}
                onChange={(e) => handleNeedsUpdateMonthsChange(e.target.value)}
              >
                <Select.Option value="1">1 month</Select.Option>
                <Select.Option value="2">2 months</Select.Option>
                <Select.Option value="3">3 months</Select.Option>
                <Select.Option value="6">6 months</Select.Option>
                <Select.Option value="9">9 months</Select.Option>
                <Select.Option value="12">12 months</Select.Option>
                <Select.Option value="18">18 months</Select.Option>
                <Select.Option value="24">24 months</Select.Option>
              </Select>
              <FormControl.HelpText>
                Content will be marked as &quot;Needs Update&quot; when it hasn&apos;t been updated for this amount of time.
              </FormControl.HelpText>
            </FormControl>

            <FormControl marginBottom="spacingL">
              <FormControl.Label>Default Time Range for Content Trends</FormControl.Label>
              <Select
                id="default-time-range"
                name="default-time-range"
                value={parameters.defaultTimeRange || "year"}
                onChange={(e) => handleDefaultTimeRangeChange(e.target.value)}
              >
                <Select.Option value="all">All Time</Select.Option>
                <Select.Option value="year">Past Year</Select.Option>
                <Select.Option value="6months">Last 6 Months</Select.Option>
              </Select>
              <FormControl.HelpText>
                The default time period to display in content trend charts.
              </FormControl.HelpText>
            </FormControl>

            <FormControl marginBottom="spacingL">
              <FormControl.Label>&quot;Recently Published&quot; Time Period</FormControl.Label>
              <Select
                id="recently-published-days"
                name="recently-published-days"
                value={parameters.recentlyPublishedDays?.toString() || "7"}
                onChange={(e) => handleRecentlyPublishedDaysChange(e.target.value)}
              >
                <Select.Option value="1">1 day</Select.Option>
                <Select.Option value="3">3 days</Select.Option>
                <Select.Option value="7">7 days</Select.Option>
                <Select.Option value="14">14 days</Select.Option>
                <Select.Option value="30">30 days</Select.Option>
              </Select>
              <FormControl.HelpText>
                Content will be considered &quot;Recently Published&quot; if it was published within this time period.
              </FormControl.HelpText>
            </FormControl>

            <FormControl marginBottom="spacingL">
              <FormControl.Label>Time to Publish Threshold</FormControl.Label>
              <Select
                id="time-to-publish-days"
                name="time-to-publish-days"
                value={parameters.timeToPublishDays?.toString() || "30"}
                onChange={(e) => handleTimeToPublishDaysChange(e.target.value)}
              >
                <Select.Option value="7">7 days</Select.Option>
                <Select.Option value="14">14 days</Select.Option>
                <Select.Option value="30">30 days</Select.Option>
                <Select.Option value="60">60 days</Select.Option>
                <Select.Option value="90">90 days</Select.Option>
              </Select>
              <FormControl.HelpText>
                The time period to calculate average time to publish metrics.
              </FormControl.HelpText>
            </FormControl>

            <FormControl marginBottom="spacingL">
              <Switch
                id="show-upcoming-releases"
                name="show-upcoming-releases"
                isChecked={parameters.showUpcomingReleases}
                onChange={handleShowUpcomingReleasesChange}
              >
                Show Upcoming Releases Section
              </Switch>
              <FormControl.HelpText>
                Toggle visibility of the upcoming releases section on the dashboard.
              </FormControl.HelpText>
            </FormControl>

            <FormControl marginBottom="spacingL">
              <FormControl.Label>Content Types to Track in Publication Trends</FormControl.Label>
              <Multiselect
                currentSelection={parameters.trackedContentTypes?.filter(id => 
                  contentTypes.some(ct => ct.id === id)
                ) || []}
                popoverProps={{ 
                  isFullWidth: true, 
                  listMaxHeight: 300 
                }}
                searchProps={{
                  searchPlaceholder: 'Search content types...',
                  onSearchValueChange: handleSearchValueChange
                }}
                noMatchesMessage="No content types match your search"
                placeholder={
                  parameters.trackedContentTypes && parameters.trackedContentTypes.length > 0
                    ? (() => {
                        const validTracked = parameters.trackedContentTypes.filter(id => 
                          contentTypes.some(ct => ct.id === id)
                        );
                        return validTracked.length > 0
                          ? `${validTracked.length} content type(s) tracked`
                          : 'Select content types to track';
                      })()
                    : 'Select content types to track'
                }
              >
                {filteredContentTypes.map(contentType => (
                  <Multiselect.Option
                    key={`track-${contentType.id}`}
                    itemId={`track-${contentType.id}`}
                    value={contentType.id}
                    label={`${contentType.name} (${contentType.id})`}
                    onSelectItem={handleTrackedContentTypeSelection}
                    isChecked={(parameters.trackedContentTypes || []).includes(contentType.id)}
                  />
                ))}
              </Multiselect>
              <FormControl.HelpText>
                Select content types to display in the publication trends chart. If none are selected, all content types will be shown.
              </FormControl.HelpText>
            </FormControl>
          </>
        )}
      </Form>
    </Flex>
  );
};

export default ConfigScreen;
