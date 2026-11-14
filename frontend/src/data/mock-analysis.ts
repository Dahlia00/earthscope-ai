import { Analysis, DEFAULT_QUERY } from '@/lib/types';
// Hand-authored fictional fixture. No observations or statistics represent NASA findings.
export const MOCK_ANALYSIS: Analysis = {
  location: { latitude: DEFAULT_QUERY.latitude, longitude: DEFAULT_QUERY.longitude },
  variable: 'T2M', unit: '°C', source: 'Fictional development fixture · not NASA observations',
  start_year: 1990, end_year: 2025,
  observations: [6.1,6.7,5.5,5.9,6.3,6.5,5.7,6.0,7.2,6.8,6.1,6.9,6.7,5.8,6.4,7.1,7.6,6.8,6.6,6.9,7.7,7.2,8.0,6.8,null,7.1,8.2,7.3,7.0,6.7,8.1,7.8,7.5,8.4,8.1,8.6].map((value, i) => ({ year: 1990 + i, value })),
  statistics: { direction: 'increasing', rate_per_decade: 0.56, p_value: 0.003, confidence_interval: [0.22, 0.90], significant: true, observation_count: 35 },
  interpretation: 'In this fictional example, annual air temperatures show an increasing trend. The sample result is statistically significant. These values illustrate how an analysis will appear; they are not evidence of a change in Ottawa.',
};
