import { Redirect } from 'expo-router';

/**
 * `/Screen/timetable` is the deep-link target for TIMETABLE_UPDATED pushes and
 * the legacy `/student/timetable` alias. The real student timetable lives at
 * `/(tabs)/timetable` (correct data source: the student's class slots, with
 * real period times and lunch/break rows). This screen previously duplicated
 * that view with hardcoded period times and the wrong data source
 * (getTeacherTimetable), so it showed no breaks and "No timetable found" for
 * students. Redirect to the canonical screen instead of maintaining a
 * divergent copy.
 */
export default function TimetableRedirect() {
  return <Redirect href="/(tabs)/timetable" />;
}
