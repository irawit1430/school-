export const metrics = {
  activeBuses: { value: 12, trend: "+1", status: "good" },
  delayedRoutes: { value: 2, trend: "-1", status: "warning" },
  totalStudents: { value: 450, trend: "92%", status: "good" },
  pendingLeaves: { value: 8, status: "urgent" },
};

export const activeRoutes = [
  { id: 1, name: "Green Valley Route", driver: "Jonathan Miller", status: "On Schedule", progress: 75, eta: "3 mins to Central Station", type: "good" },
  { id: 2, name: "Oak Ridge Loop", driver: "Sarah Thompson", status: "Delayed", progress: 45, eta: "15 mins (Heavy Traffic)", type: "warning" },
  { id: 3, name: "Pine District North", driver: "Michael Chen", status: "On Schedule", progress: 90, eta: "2 mins to St. Andrews", type: "good" },
];

export const recentLeaves = [
  { id: 1, student: "Emily Watson", initials: "EW", date: "Oct 25, 2023", reason: "Medical Appointment", color: "bg-purple-100 text-purple-700" },
  { id: 2, student: "Liam Murphy", initials: "LM", date: "Oct 26, 2023", reason: "Family Event", color: "bg-green-100 text-green-700" },
  { id: 3, student: "Jacob Smith", initials: "JS", date: "Oct 25, 2023", reason: "Fever / Illness", color: "bg-blue-100 text-blue-700" },
];

export const allRoutes = [
  { id: 1, name: "Northside Morning Loop", bus: "Bus #102", driver: "Sarah Jenkins", stops: 12, time: "0h 52m", status: "ON SCHEDULE" },
  { id: 2, name: "East Valley Express", bus: "Bus #205", driver: "Michael Chen", stops: 8, time: "0h 35m", status: "DELAYED" },
  { id: 3, name: "Southshore Connector", bus: "Bus #088", driver: "Unassigned", stops: 15, time: "1h 10m", status: "INACTIVE" },
  { id: 4, name: "Westside High Transit", bus: "Bus #144", driver: "Robert Taylor", stops: 20, time: "1h 15m", status: "OPTIMIZING" },
];

export const students = [
  { id: 1, name: "Liam Thompson", tag: "#89210", grade: "4th Grade", route: "Green Valley Loop", status: "Boarded", time: "07:42 AM", avatar: "https://picsum.photos/seed/liam/100/100" },
  { id: 2, name: "Sarah Jenkins", tag: "#88462", grade: "7th Grade", route: "North Ridge Express", status: "Absent", time: "--:--", avatar: "https://picsum.photos/seed/sarah/100/100" },
  { id: 3, name: "Marcus Chen", tag: "#89001", grade: "10th Grade", route: "Sunset Avenue", status: "Delayed", time: "08:05 AM", avatar: "https://picsum.photos/seed/marcus/100/100" },
  { id: 4, name: "Aria Rodriguez", tag: "#88323", grade: "3rd Grade", route: "Lakeview Circle", status: "At School", time: "08:15 AM", avatar: "https://picsum.photos/seed/aria/100/100" },
  { id: 5, name: "Zoe Walters", tag: "#88117", grade: "5th Grade", route: "Old Town Loop", status: "Boarded", time: "07:55 AM", avatar: "https://picsum.photos/seed/zoe/100/100" },
];

export const attendanceData = [
  { name: 'Boarded', value: 382, color: '#4f46e5' },
  { name: 'Not Boarded', value: 68, color: '#e5e7eb' },
];

export const studentAlerts = [
  { id: 1, title: "Emily Watson", desc: "Absent | Medical Leave", type: "error" },
  { id: 2, title: "Jacob Smith", desc: "Late Check-in | Route 102", type: "warning" },
  { id: 3, title: "Route 401", desc: "Capacity reaching 95%", type: "info" },
  { id: 4, title: "Bus Mechanical", desc: "Route Green Valley delayed", type: "warning" },
];
