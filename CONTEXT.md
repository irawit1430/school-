# Voltava School Admin Dashboard - Context & Working Guide

## 1. How this App is Working (Architecture)

This application is the **School Admin Dashboard** for Voltava's fleet management system. It is built using **Next.js 15 (App Router)** and **React**, styled with **Tailwind CSS**.

- **Frontend**: Next.js client-side application (using `"use client"` heavily as it's a SPA-like dashboard).
- **Backend API**: Connects to a live backend REST API hosted at `https://gps-backend-jzd7.onrender.com/api`.
- **Authentication**: JWT-based authentication. Users log in with email/password. The `token` and `user` data (including their `schoolId` and `role`) are stored securely in `localStorage`. All subsequent protected API requests include the `Authorization: Bearer <token>` header.
- **Real-Time WebSockets**: The app relies on `socket.io-client` connecting to the backend to receive live telemetry (`location_update`) for bus GPS tracking on maps, and instant SOS broadcasts (`emergency_alert`) from drivers.

---

## 2. Real vs. Mock Data (Current State)

The application has been actively transitioning from a static prototype to a fully integrated live dashboard. 

### What is REAL (Fetched from the Backend):
- **Authentication & Login**: The login flow strictly verifies credentials against the live database.
- **API Integration Layer (`lib/api.ts`)**: Almost all CRUD operations are wired up to fetch real data from the server. This includes:
  - Global Search (`/api/search`)
  - Notifications (`/api/notifications`)
  - Dashboard KPIs and Stats (`/api/stats`)
  - Students & Attendance (`/api/schools/:id/students`, `/api/schools/:id/attendance/today`)
  - Buses & Fleet (`/api/schools/:id/buses`)
  - Routes & Trips (`/api/schools/:id/routes`, `/api/schools/:id/trips`)
  - Drivers (`/api/schools/:id/drivers`)
  - Leave Requests (`/api/schools/:id/leaves`)

### What is MOCK (Fallback / Hardcoded):
- **UI Fallbacks (`lib/mock-data.ts`)**: Some components still import mock arrays (e.g., `mockStudents`, `studentAlerts`). This is primarily used as a fallback if the live database is empty, ensuring the UI doesn't look blank during testing or presentations.
- **Map Polyline/Route Data**: While live bus locations are intended to be real, the drawn route paths on the map might still use hardcoded GPS coordinates for demonstration purposes.
- **Staging Data**: The backend itself might be returning "simulated" alerts or staging data if real hardware (like TM-100 GPS trackers or RFID scanners) isn't actively generating logs.

---

## 3. The Ultimate Goal of this App

The primary objective of this dashboard is to act as the **Central Command Center for School Administrators**, giving them complete visibility and control over their transportation operations. 

**Core Objectives:**
1. **Live Fleet Visibility**: Allow admins to track every bus in real-time on a map to monitor delays or off-route deviations.
2. **Student Safety & Attendance**: Provide an accurate, real-time log of which students have boarded or exited the bus (typically via RFID hardware integration).
3. **Operational Efficiency**: Give admins the tools to manage routes, assign drivers to buses, and handle parent leave requests efficiently.
4. **Emergency Response**: Create an instant alert system where driver SOS signals immediately notify the school admin for rapid response.
5. **Analytics**: Deliver actionable metrics (e.g., offline devices, delayed routes, student boarding counts) to help optimize the school's fleet over time.
