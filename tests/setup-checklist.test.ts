import { expect, test } from 'vitest';
import { setupSteps } from '../components/views/overview/SetupChecklist';

const done = (input: Parameters<typeof setupSteps>[0]) =>
  setupSteps(input).filter(step => step.done).map(step => step.key);

test('a brand-new school has every step still to do, in dependency order', () => {
  const steps = setupSteps({ totalBuses: 0, totalStudents: 0, drivers: [], routes: [] });
  expect(steps.map(step => step.key)).toEqual(['buses', 'drivers', 'routes', 'students', 'schedules']);
  expect(steps.every(step => !step.done)).toBe(true);
});

test('a route without stops does not count — students cannot be assigned to it', () => {
  expect(done({ totalBuses: 2, drivers: [{}], routes: [{ stops: [] }] })).toEqual(['buses', 'drivers']);
  expect(done({ totalBuses: 2, drivers: [{}], routes: [{ stops: [{}] }] })).toEqual(['buses', 'drivers', 'routes']);
});

test('any trip on any route means scheduling has been done', () => {
  expect(done({ totalBuses: 1, totalStudents: 40, drivers: [{}], routes: [{ stops: [{}], trips: [{}] }] }))
    .toEqual(['buses', 'drivers', 'routes', 'students', 'schedules']);
});
