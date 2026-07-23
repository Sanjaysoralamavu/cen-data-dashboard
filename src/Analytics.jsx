import { useEffect, useRef } from 'react';
import ReactGA from 'react-ga4';

// Retrieve the tracking ID from Vite environment variables
const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

function currentPage() {
  if (typeof window === 'undefined') {
    return '/';
  }

  return `${window.location.pathname}${window.location.search}`;
}

export default function AnalyticsTracker({ id }) {
  const trackedPage = useRef('');

  // Initialize GA4 exactly once when the application starts
  useEffect(() => {
    if (GA_ID) {
      ReactGA.initialize(GA_ID);
    }
  }, []);

  // Send a pageview event every time the URL path changes
  useEffect(() => {
    if (!GA_ID) {
      return;
    }

    const page = currentPage();
    if (trackedPage.current === page) {
      return;
    }

    trackedPage.current = page;
    ReactGA.send({
      hitType: 'pageview',
      page,
    });
  }, [id]);

  return null;
}
