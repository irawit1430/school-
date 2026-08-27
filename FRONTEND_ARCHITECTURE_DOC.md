# Voltava Frontend Architecture & Logic Document

This document serves as the absolute source of truth for all working frontend logic, state management, validations, real-time socket listeners, and API integrations in the Voltava School Admin Dashboard.

---

## 1. Core API & Network Layer (`lib/api.ts`)

All API calls (except CSV import) are routed through a generic `api<T>` wrapper function that uses standard `fetch`.
*   **Automatic Headers:** Injects `Content-Type: application/json` and `Authorization: Bearer <token>` retrieved from stateless `localStorage`.
*   **Global Error Handling:** Emits `ApiError(message, status, issues)` which intercepts:
    *   `401`: Session expired (clears cache, routes to `/login`).
    *   `403`: Cross-tenant forbidden.
    *   `429`: Rate-limit constraints.

### Integrated Endpoints Map

**Auth & Users**
*   `POST /auth/login` | `PUT /users/{userId}/password` | `PUT /parents/{parentId}`

**Schools & Super Admin**
*   `GET /schools` (Used conditionally by `getSchoolId()` if user is `SUPER_ADMIN`)

**Routes & Stops**
*   `GET /schools/{schoolId}/routes` | `POST /schools/{schoolId}/routes`
*   `PUT /routes/{routeId}` | `DELETE /routes/{routeId}`
*   `POST /routes/{routeId}/stops` | `PUT /routes/{routeId}/stops/{stopId}` | `DELETE /routes/{routeId}/stops/{stopId}`
*   `PUT /routes/{routeId}/stops/reorder` (Takes `Array<{id, orderIdx}>`)

**Fleet (Buses & Drivers)**
*   `GET /schools/{schoolId}/buses` | `POST /schools/{schoolId}/buses` | `DELETE /buses/{busId}`
*   `GET /schools/{schoolId}/drivers` | `POST /schools/{schoolId}/drivers`

**Students**
*   `GET /schools/{schoolId}/students` | `POST /schools/{schoolId}/students`
*   `POST /student-route-mappings` (Assigns student to stop)
*   `POST /schools/{schoolId}/students/import` (CSV Upload. Bypasses core wrapper for `FormData` boundaries)

**Trips**
*   `POST /schools/{schoolId}/trips`
*   `PUT /trips/{tripId}` (Updates status, routeId, busId, driverId, or scheduledStart)

**Leaves & Attendance**
*   `GET /schools/{schoolId}/leaves?status={status}`
*   `PUT /leaves/{id}/approve` | `PUT /leaves/{id}/reject`
*   `GET /schools/{schoolId}/attendance/today`

**Notifications & Broadcasts**
*   `GET /notifications?limit={limit}` (Massages/flattens payloads internally)
*   `POST /notifications/mark-read` | `POST /notifications/{id}/read` (Requires `{}` body payload)
*   `POST /broadcast`

**Global & Maps**
*   `GET /stats` | `GET /search?q={query}` | `GET /devices/locations`

---

## 2. Real-time Capabilities (Socket.IO)

The frontend establishes websockets (`connectSocket()`) passing the JWT token securely via `{ auth: { token } }`.
It actively listens to the following events:
1.  **`notification`**: Injected into `Header.tsx` to update the notification feed in real-time.
2.  **`emergency_alert`**: Injected into `EmergencyAlertBanner.tsx`. Evaluates role/scope and pushes to a global banner array.
3.  **`location_update`**: Injected into `Overview.tsx` and map views to optimistically patch bus GPS telemetry array without reloading.

---

## 3. Core UI, Auth, and Dashboard

### Authentication (`app/login`)
*   Catches `429 Too Many Requests` specifically.
*   Parses field-level validation errors (Zod) from `issues` array and highlights inputs in red.
*   **Forced Password Reset:** If the backend flags `mustResetPassword === true`, dynamically switches to a reset form, validates client-side matching, calls the API, and updates local context before routing to the dashboard.

### Header Navigation (`Header.tsx`)
*   **Search Engine:** Debounced (300ms) global search, rendering categorized lists (student, driver, bus, route) with color-coded icons.
*   **Notifications (Anti-Race Condition Logic):** Has a 60-second polling interval. When marked read, applies a **15-second `skipPollUntil` lock** to prevent stale backend data from reverting the optimistic UI.
*   **Inline Admin Tasks:** Parent `PASSWORD_RESET` notifications feature an inline "Reset Password" button. Allows admin to set a temporary password directly from the dropdown.

### Emergency Alert Banner
*   Global `z-[100]` overlay. Skips pointer events on the wrapper to not block the app.
*   **DELAY vs SOS:** Routine `DELAY` types render dynamically in orange styling. `SOS/CRITICAL` alerts pulse in red. Both stack and are manually dismissible.

### Broadcast Modal
*   Allows custom system messages targeting `PARENTS`, `DRIVERS`, or `ALL` with a specific type (`SYSTEM`, `SOS`, `DELAY`). Handles click-outside closures.

### Dashboard / Overview
*   **Parallel Fetch:** Fires a `Promise.all` for buses, pending leaves, stats, routes, and drivers.
*   **Telemetry Sync:** Listens to `location_update` socket events, mutating the memory array to feed the live map widget seamlessly.
*   **Inline Approvals:** Pending leaves widget allows inline approvals/rejections with optimistic UI removal and toaster feedback.

---

## 4. Transport & Maps (Fleet Management)

### Manage Routes
*   Concurrently fetches Routes, Buses, Drivers, and Stats.
*   **Status Logic:** A route's status is derived from its latest trip (`latestTrip.status`). PLANNED/ON_SCHEDULE/DELAYED = Active.
*   **CSV Sanitization:** Applies `csvCell` parsing to neutralize Excel formula injections (prefixes `=+-@`).
*   **Trip Controls:** Edits trips (opening `EditTripModal`), cancels active trips, assigns bus/driver, or opens Map Editor.

### Map Editor (`RouteMapEditor.tsx` & OSRM)
*   **Interactive Build:** Click to place stops. Drag-and-drop sortable list (`@dnd-kit`). Click reverse-geocodes.
*   **Computation & Caching:** Prevents OSRM API bans (Nominatim 1 req/sec limit) by enforcing a 1100ms throttle. Generates a string signature of coordinates to cache responses.
*   **Granular Sync:** Reconciles differences on save (diffs `initialStops` vs `currentStops`) and patches dynamically via independent API calls to minimize data load.

### Live Fleet Tracking (`RealMap.tsx` & `DynamicMap.tsx`)
*   **Next.js Dynamic Load:** Map is loaded via `dynamic()` with `ssr: false` because Leaflet requires a `window` object.
*   **Custom Markers:** React Leaflet uses `L.divIcon` cached via a strict key (`${id}-${selected}-${alert}-${delayed}`). 
*   **Speed Logic:** Marks a vehicle as speeding/alerting if `gpsLogs?.[0]?.speed > 60`. 
*   **Camera Tracking:** Auto-pans `flyTo` when a vehicle is focused, pausing CSS transitions dynamically to prevent jitter.

### Buses & Drivers CRUD
*   Native form validation. Bus assignment blocks submissions if capacity is <= 0.
*   When a Driver is created, the temporary password is shown in a one-time Credentials Modal using `navigator.clipboard.writeText()` for easy copying.
*   Driver active status is dynamically evaluated based on assigned trip status.

---

## 5. Students & Attendance Management

### Main View (`StudentsAttendance.tsx`)
*   **Data Aggregation:** Cross-references `studentsData` against `attendanceLogs` via `useMemo` to determine real-time `Boarded`, `At School`, or `Absent` statuses.
*   **Fuzzy Search:** Case-insensitive string search spanning Name, RFID tag, and Route fields.
*   **CSV Exporter:** Aggregates processed states (including resolved route names) into a Blob download.

### Leave Requests
*   Sorts applications dynamically (ALL/PENDING/APPROVED/REJECTED).
*   Uses a unique processing ID lock state to prevent multi-clicks while approving/rejecting.

### Sub-Modals
*   **Add Student:** Validates inputs, creates record, handles Credentials popup if a parent account was automatically generated.
*   **Import CSV:** Processes bulk uploads, showing the bulk Credentials Modal showing all generated parent temporary passwords simultaneously.
*   **Assign Bus:** Dropdown logic clears `routeStopId` aggressively if `routeId` changes to prevent mismatched route data.
*   **Message Parent:** Simulated functionality via `setTimeout` providing UX flow placeholders.
*   **View Profile:** Displays read-only badges mapping exact status colors used in the main tables.
