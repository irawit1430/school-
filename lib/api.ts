export const API_BASE = 'https://gps-backend-jzd7.onrender.com/api';

export const clearSchoolIdCache = () => {
  cachedSchoolId = null;
  schoolIdPromise = null;
};

const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
};

let cachedSchoolId: string | null = null;
let schoolIdPromise: Promise<string | null> | null = null;

const getSchoolId = async () => {
  const user = localStorage.getItem('user');
  if (user) {
    try {
      const parsed = JSON.parse(user);
      if (parsed.schoolId) {
        return parsed.schoolId;
      }
      
      if (parsed.role === 'SUPER_ADMIN') {
         if (cachedSchoolId) return cachedSchoolId;
         if (schoolIdPromise) return schoolIdPromise;

         schoolIdPromise = (async () => {
           try {
             const res = await fetch(`${API_BASE}/schools`, { headers: getHeaders() });
             if (res.ok) {
               const responseData = await res.json();
               const schools = Array.isArray(responseData) ? responseData : responseData.data;
               if (schools && schools.length > 0) {
                 cachedSchoolId = schools[0].id;
                 return cachedSchoolId;
               }
             }
           } finally {
             schoolIdPromise = null;
           }
           return null;
         })();

         return schoolIdPromise;
      }
    } catch (e) {
      return null;
    }
  }
  return null;
};

export const fetchBuses = async () => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new Error('No school ID found');
  
  const res = await fetch(`${API_BASE}/schools/${schoolId}/buses`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch buses');
  return res.json();
};

export const fetchLeaves = async (status?: string) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new Error('No school ID found');
  
  const url = status && status !== 'all' 
    ? `${API_BASE}/schools/${schoolId}/leaves?status=${status}` 
    : `${API_BASE}/schools/${schoolId}/leaves`;
    
  const res = await fetch(url, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch leaves');
  return res.json();
};

export const assignStudentToStop = async (data: { studentId: string, routeStopId: string }) => {
  const res = await fetch(`${API_BASE}/student-route-mappings`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let errorMessage = 'Failed to assign student';
    try {
      const text = await res.text();
      errorMessage = `Failed to assign student (HTTP ${res.status}): ${text.substring(0, 100)}`;
    } catch (e) {
      // ignore
    }
    throw new Error(errorMessage);
  }
  
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : { success: true };
  } catch (e) {
    return { success: true, text };
  }
};

export const fetchStats = async () => {
  const res = await fetch(`${API_BASE}/stats`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
};

export const approveLeave = async (id: string) => {
  const res = await fetch(`${API_BASE}/leaves/${id}/approve`, {
    method: 'PUT',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to approve leave');
  return res.json();
};

export const rejectLeave = async (id: string) => {
  const res = await fetch(`${API_BASE}/leaves/${id}/reject`, {
    method: 'PUT',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to reject leave');
  return res.json();
};

export const fetchRoutes = async () => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new Error('No school ID found');
  
  const res = await fetch(`${API_BASE}/schools/${schoolId}/routes`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch routes');
  return res.json();
};

export const fetchStudents = async () => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new Error('No school ID found');
  
  const res = await fetch(`${API_BASE}/schools/${schoolId}/students`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch students');
  return res.json();
};

export const fetchTodayAttendance = async () => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new Error('No school ID found');
  
  const res = await fetch(`${API_BASE}/schools/${schoolId}/attendance/today`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch attendance');
  return res.json();
};

export const createRoute = async (data: { name: string, estimatedDuration?: number }) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new Error('No school ID found');
  
  const res = await fetch(`${API_BASE}/schools/${schoolId}/routes`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create route');
  return res.json();
};

export const createTrip = async (data: { routeId: string, busId: string, driverId: string }) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new Error('No school ID found');
  
  const res = await fetch(`${API_BASE}/schools/${schoolId}/trips`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create trip');
  return res.json();
};

export const fetchDrivers = async () => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new Error('No school ID found');
  
  const res = await fetch(`${API_BASE}/schools/${schoolId}/drivers`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch drivers');
  return res.json();
};

export const createDriver = async (data: { name: string, email: string }) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new Error('No school ID found');
  
  const res = await fetch(`${API_BASE}/schools/${schoolId}/drivers`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create driver');
  return res.json();
};

export const updateRoute = async (routeId: string, data: { name?: string, estimatedDuration?: number }) => {
  const res = await fetch(`${API_BASE}/routes/${routeId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update route');
  return res.json();
};

export const deleteRoute = async (routeId: string) => {
  const res = await fetch(`${API_BASE}/routes/${routeId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete route');
  return res.json();
};

export const createStudent = async (data: { rfidTag: string, name: string, grade?: string, parentEmail?: string, parentName?: string }) => {
  const schoolId = await getSchoolId();
  if (!schoolId) throw new Error('No school ID found');
  
  const res = await fetch(`${API_BASE}/schools/${schoolId}/students`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create student');
  return res.json();
};
