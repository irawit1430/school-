/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
 
"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { fetchLeaves, approveLeave, rejectLeave, apiErrorMessage } from '@/lib/api';
import { leaveDays, formatDay } from '@/lib/leaves';
import { CheckCircle, XCircle, Clock, Filter, Download, Calendar, FileText, Search } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';


const StatusBadge = ({ status }: { status: string }) => {
  switch (status?.toUpperCase()) {
    case 'APPROVED':
      return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-max"><CheckCircle size={12} /> Approved</span>;
    case 'REJECTED':
      return <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-max"><XCircle size={12} /> Rejected</span>;
    default:
      return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-max"><Clock size={12} /> Pending</span>;
  }
};

/**
 * The leave queue is the longest list in the product in exam season and it rendered every
 * row at once, with no way to find one child. An office clearing fifty requests scrolled
 * for the name the parent had just phoned about. The API returns the whole list anyway, so
 * search and paging happen here; no request changes.
 */
export const LEAVES_PAGE_SIZE = 25;

const isPending = (leave: any) => (leave.status || 'PENDING').toUpperCase() === 'PENDING';

export function LeaveRequests() {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? leaves.filter(leave =>
          `${leave.student?.name ?? ''} ${leave.student?.rfidTag ?? ''}`.toLowerCase().includes(q))
      : leaves;
    // Pending first, otherwise in the order the server sent. Under "All Requests" the
    // decisions still owed used to be scattered among processed ones, which paging would
    // have spread across several pages.
    return [...matched].sort((a, b) => Number(isPending(b)) - Number(isPending(a)));
  }, [leaves, query]);

  const pageCount = Math.max(1, Math.ceil(visible.length / LEAVES_PAGE_SIZE));
  // Clamped rather than reset: approving the last row on the last page shrinks the list,
  // and the page should follow instead of showing an empty table.
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * LEAVES_PAGE_SIZE;
  const pageRows = visible.slice(firstIndex, firstIndex + LEAVES_PAGE_SIZE);

  /**
   * A failed load used to catch with console.error and nothing else, so the table fell
   * through to its empty state and announced "No leave requests found — there are no
   * leave applications matching your current filter." A network blip became a confident,
   * specific, wrong statement, and the office moved on leaving real requests unanswered.
   * The last loaded list is kept, because a stale list is honest and an empty one is not.
   */
  const loadLeaves = () => {
    setLoading(true);
    const apiStatus = statusFilter === 'ALL' ? 'all' : statusFilter.toLowerCase();
    fetchLeaves(apiStatus)
      .then(data => {
        if (!Array.isArray(data)) throw new Error('Unexpected response from the server.');
        setLeaves(data);
        setLoadError('');
      })
      .catch(err => setLoadError(apiErrorMessage(err, 'Could not load leave requests.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadLeaves();
     
  }, [statusFilter]);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await approveLeave(id);
      loadLeaves();
    } catch (err) {
      console.error(err);
      toast.error(apiErrorMessage(err, 'Failed to approve leave.'));
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    try {
      await rejectLeave(id);
      loadLeaves();
    } catch (err) {
      console.error(err);
      toast.error(apiErrorMessage(err, 'Failed to reject leave.'));
    } finally {
      setProcessingId(null);
    }
  };

  const handleExportCSV = () => {
    if (visible.length === 0) return toast.error('No leaves to export');
    const headers = ['Student Name,Student ID,Start Date,End Date,Reason,Status'];
    const escape = (v: any) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return `"${/^[=+\-@]/.test(s) ? `'${s}` : s}"`;
    };
    // What is on screen after search and status filter, not the unfiltered list.
    const rows = visible.map((leave: any) => {
      const studentName = leave.student?.name || 'Unknown';
      const rfid = leave.student?.rfidTag || 'N/A';
      const days = leaveDays(leave);
      const startDate = formatDay(days.start);
      const endDate = formatDay(days.end);
      const status = leave.status || 'PENDING';
      return [studentName, rfid, startDate, endDate, leave.reason, status].map(escape).join(',');
    });
    
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "leaves_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'APPROVED':
        return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-max"><CheckCircle size={12} /> Approved</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-max"><XCircle size={12} /> Rejected</span>;
      default:
        return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-max"><Clock size={12} /> Pending</span>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Leave Requests</h2>
          <p className="text-sm text-slate-500 mt-1">Manage and track student leave applications</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExportCSV} className="flex items-center gap-2 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 px-4 py-2 border border-slate-200 rounded-lg transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Couldn&apos;t load leave requests.</p>
          <p className="mt-0.5">{loadError}</p>
          {leaves.length > 0 && <p className="mt-1">Showing the last loaded list. Refresh before approving or rejecting.</p>}
          <button disabled={loading} onClick={loadLeaves} className="mt-2 font-semibold underline disabled:opacity-50">
            Retry
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400" />
            <select 
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="text-sm font-semibold border-none bg-transparent text-slate-700 focus:ring-0 cursor-pointer outline-none"
            >
              <option value="ALL">All Requests</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <label className="relative flex-1 max-w-xs">
            <span className="sr-only">Search by student name or ID</span>
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search student name or ID"
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
            />
          </label>
          <div className="text-xs font-semibold text-slate-500 flex items-center gap-2">
            {loading ? <><div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div> Loading...</> : query.trim() ? `${visible.length} of ${leaves.length} Applications` : `${leaves.length} Applications`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 border-b border-slate-100">Student Info</th>
                <th className="px-6 py-4 border-b border-slate-100">Duration</th>
                <th className="px-6 py-4 border-b border-slate-100">Reason</th>
                <th className="px-6 py-4 border-b border-slate-100">Status</th>
                <th className="px-6 py-4 border-b border-slate-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center mb-2">
                      <div className="w-6 h-6 border-2 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    Loading leaves...
                  </td>
                </tr>
              ) : leaves.length > 0 && visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <Search size={28} className="mx-auto text-slate-300 mb-3" />
                    <p className="font-medium text-slate-900">No student matches &ldquo;{query.trim()}&rdquo;</p>
                    <button onClick={() => { setQuery(''); setPage(1); }} className="mt-2 text-xs font-semibold text-orange-700 underline">
                      Clear search
                    </button>
                  </td>
                </tr>
              ) : leaves.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <FileText size={32} className="mx-auto text-slate-300 mb-3" />
                    <p className="font-medium text-slate-900">
                      {loadError ? 'Leave requests are unavailable' : 'No leave requests found'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {loadError
                        ? 'This is not the same as having none. Use Retry above.'
                        : 'There are no leave applications matching your current filter.'}
                    </p>
                  </td>
                </tr>
              ) : (
                pageRows.map((leave) => {
                  const studentName = leave.student?.name || 'Unknown Student';
                  const initials = studentName.substring(0, 2).toUpperCase();
                  const days = leaveDays(leave);
                  const startDate = formatDay(days.start);
                  const endDate = formatDay(days.end);
                  const pending = isPending(leave);
                  
                  return (
                    <tr key={leave.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-xs">
                            {initials}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{studentName}</p>
                            <p className="text-xs text-slate-500 font-medium">ID: {leave.student?.rfidTag || 'N/A'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                            <Calendar size={14} className="text-slate-400" />
                            {startDate}
                          </div>
                          {startDate !== endDate && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <span className="text-slate-300 ml-1">to</span> {endDate}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-700 max-w-xs truncate" title={leave.reason}>{leave.reason}</p>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(leave.status)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {pending ? (
                            <>
                              <button 
                                onClick={() => handleApprove(leave.id)}
                                disabled={processingId === leave.id}
                                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {processingId === leave.id ? '...' : 'Approve'}
                              </button>
                              <button 
                                onClick={() => handleReject(leave.id)}
                                disabled={processingId === leave.id}
                                className="bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-200 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {processingId === leave.id ? '...' : 'Reject'}
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium italic">Processed</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && visible.length > LEAVES_PAGE_SIZE && (
          <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {firstIndex + 1}–{firstIndex + pageRows.length} of {visible.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span aria-live="polite">Page {currentPage} of {pageCount}</span>
              <button
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage === pageCount}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
