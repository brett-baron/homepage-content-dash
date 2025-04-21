import React from 'react';
import { HomeAppSDK } from '@contentful/app-sdk';
import { /* useCMA, */ useSDK } from '@contentful/react-apps-toolkit';

const Home = () => {
  const sdk = useSDK<HomeAppSDK>();
  /*
     To use the cma, inject it as follows.
     If it is not needed, you can remove the next line.
  */
  // const cma = useCMA();

  return (
    <div className="bg-red-500">
      <h1>Hello Home Component (AppId: {sdk.ids.app})</h1>
    </div>
  )
};

export default Home;
