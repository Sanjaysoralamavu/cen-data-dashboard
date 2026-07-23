import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import ReactGA from 'react-ga4';

// Retrieve the tracking ID from Vite environment variables
const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

export default function AnalyticsTracker() {
  const location = useLocation();

  // Initialize GA4 exactly once when the application starts
  useEffect(() => {
    if (GA_ID) {
      ReactGA.initialize(GA_ID);
    }
  }, []);

  // Send a pageview event every time the URL path changes
  useEffect(() => {
    if (GA_ID) {
      ReactGA.send({
        hitType: 'pageview',
        page: location.pathname + location.search,
      });
    }
  }, [location]);

  return null;
}
