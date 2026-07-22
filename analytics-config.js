// The site remains fully functional if this endpoint is unavailable.
// Production routes this same-origin path to analytics-worker/ through Cloudflare.
export const ANALYTICS_ENDPOINT = '/api/analytics';
export const ANALYTICS_HOSTS = ['step3d-sim.petrichor.tw'];
