import React, { useCallback, useState, useEffect } from 'react';
import { ConfigAppSDK } from '@contentful/app-sdk';
import { Heading, Form, Paragraph, Flex, FormControl, Note, Spinner, Select } from '@contentful/f36-components';
import { Multiselect } from '@contentful/f36-multiselect';
import { css } from 'emotion';
import { useCMA, useSDK } from '@contentful/react-apps-toolkit';

export interface AppInstallationParameters {
  excludedContentTypes?: string[];
  needsUpdateMonths?: number;
  defaultTimeRange?: 'all' | 'year' | '6months';
  recentlyPublishedDays?: number;
}

const ConfigScreen = () => {
  const [parameters, setParameters] = useState<AppInstallationParameters>({
    excludedContentTypes: [],
    needsUpdateMonths: 6,
    defaultTimeRange: 'year',
    recentlyPublishedDays: 7
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
        // Get content types to populate the exclusion list
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
              if (parsedConfig.excludedContentTypes) {
                const validExcludedTypes = parsedConfig.excludedContentTypes.filter(id => 
                  sortedContentTypes.some(ct => ct.id === id)
                );
                
                if (validExcludedTypes.length !== parsedConfig.excludedContentTypes.length) {
                  console.warn('Some excluded content types were filtered out because they do not exist:', 
                    parsedConfig.excludedContentTypes.filter(id => !sortedContentTypes.some(ct => ct.id === id))
                  );
                  parsedConfig.excludedContentTypes = validExcludedTypes;
                }
              }
              
              // Ensure we have a valid needsUpdateMonths
              if (!parsedConfig.needsUpdateMonths || parsedConfig.needsUpdateMonths < 1) {
                parsedConfig.needsUpdateMonths = 6; // Default to 6 months
              }
              
              // Ensure we have a valid defaultTimeRange
              if (!parsedConfig.defaultTimeRange || !['all', 'year', '6months'].includes(parsedConfig.defaultTimeRange)) {
                parsedConfig.defaultTimeRange = 'year'; // Default to year
              }
              
              // Ensure we have a valid recentlyPublishedDays
              if (!parsedConfig.recentlyPublishedDays || parsedConfig.recentlyPublishedDays < 1) {
                parsedConfig.recentlyPublishedDays = 7; // Default to 7 days
              }
              
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
          // Ensure default needsUpdateMonths if not set
          if (!currentParameters.needsUpdateMonths) {
            currentParameters.needsUpdateMonths = 6;
          }

          // Ensure default defaultTimeRange if not set
          if (!currentParameters.defaultTimeRange) {
            currentParameters.defaultTimeRange = 'year';
          }
          
          // Ensure default recentlyPublishedDays if not set
          if (!currentParameters.recentlyPublishedDays) {
            currentParameters.recentlyPublishedDays = 7;
          }
          
          setParameters(currentParameters);
        } else {
          // Initialize with defaults if no parameters exist
          setParameters({ 
            excludedContentTypes: [],
            needsUpdateMonths: 6,
            defaultTimeRange: 'year',
            recentlyPublishedDays: 7
          });
        }
      } catch (error) {
        console.error('Error loading content types:', error);
      } finally {
        setIsLoading(false);
        // Once preparation has finished, call `setReady` to hide
        // the loading screen and present the app to a user.
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

  const handleContentTypeSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { checked, value } = event.target;
    console.log(`Content type selection changed: ${value} - ${checked ? 'checked' : 'unchecked'}`);

    setParameters(prev => {
      const excludedContentTypes = prev.excludedContentTypes || [];

      if (checked) {
        // Add to excluded types
        return {
          ...prev,
          excludedContentTypes: [...excludedContentTypes, value]
        };
      } else {
        // Remove from excluded types
        return {
          ...prev,
          excludedContentTypes: excludedContentTypes.filter(id => id !== value)
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
              <FormControl.Label>Content "Needs Update" Time Threshold</FormControl.Label>
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
                Content will be marked as "Needs Update" when it hasn't been updated for this amount of time.
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
              <FormControl.Label>"Recently Published" Time Period</FormControl.Label>
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
                Content will be considered "Recently Published" if it was published within this time period.
              </FormControl.HelpText>
            </FormControl>

            <FormControl>
              <FormControl.Label>Content Types to Exclude from Orphaned Entries</FormControl.Label>
              <Multiselect
                currentSelection={parameters.excludedContentTypes?.filter(id => 
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
                  parameters.excludedContentTypes && parameters.excludedContentTypes.length > 0
                    ? (() => {
                        const validExcluded = parameters.excludedContentTypes.filter(id => 
                          contentTypes.some(ct => ct.id === id)
                        );
                        return validExcluded.length > 0
                          ? `${validExcluded.length} content type(s) excluded`
                          : 'Select content types to exclude';
                      })()
                    : 'Select content types to exclude'
                }
              >
                {filteredContentTypes.map(contentType => (
                  <Multiselect.Option
                    key={contentType.id}
                    itemId={`exclude-${contentType.id}`}
                    value={contentType.id}
                    label={`${contentType.name} (${contentType.id})`}
                    onSelectItem={handleContentTypeSelection}
                    isChecked={(parameters.excludedContentTypes || []).includes(contentType.id)}
                  />
                ))}
              </Multiselect>
              <FormControl.HelpText>
                Select content types that should not appear in the orphaned content detection.
              </FormControl.HelpText>
            </FormControl>
          </>
        )}
      </Form>
    </Flex>
  );
};

export default ConfigScreen;
