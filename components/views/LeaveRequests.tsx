/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useState, useEffect } from 'react';
import { fetchLeaves, approveLeave, rejectLeave } from '@/lib/api';
import { CheckCircle, XCircle, Clock, Filter, Download, User, Calendar, FileText } from 'lucide-react';
import { clsx } from 'clsx';

export function LeaveRequests() {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadLeaves = () => {
    setLoading(true);
    const apiStatus = statusFilter === 'ALL' ? 'all' : statusFilter.toLowerCase();
    fetchLeaves(apiStatus)
      .then(data => {
        setLeaves(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load leaves:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadLeaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await approveLeave(id);
      loadLeaves();
    } catch (err) {
      console.error(err);
      alert('Failed to approve leave');
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
      alert('Failed to reject leave');
    } finally {
      setProcessingId(null);
    }
  };

  const handleExportCSV = () => {
    if (leaves.length === 0) return alert('No leaves to export');
    const headers = ['Student Name,RFID,Start Date,End Date,Reason,Status'];
    const rows = leaves.map((leave: any) => {
      const studentName = leave.student?.name || 'Unknown';
      const rfid = leave.student?.rfidTag || 'N/A';
      const startDate = new Date(leave.startDate).toLocaleDateString();
      const endDate = new Date(leave.endDate).toLocaleDateString();
      const status = leave.status || 'PENDING';
      return `"${studentName}","${rfid}","${startDate}","${endDate}","${leave.reason}","${status}"`;
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
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

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400" />
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-sm font-semibold border-none bg-transparent text-slate-700 focus:ring-0 cursor-pointer outline-none"
            >
              <option value="ALL">All Requests</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div className="text-xs font-semibold text-slate-500 flex items-center gap-2">
            {loading ? <><div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div> Loading...</> : `${leaves.length} Applications`}
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
              ) : leaves.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <FileText size={32} className="mx-auto text-slate-300 mb-3" />
                    <p className="font-medium text-slate-900">No leave requests found</p>
                    <p className="text-xs text-slate-500 mt-1">There are no leave applications matching your current filter.</p>
                  </td>
                </tr>
              ) : (
                leaves.map((leave) => {
                  const studentName = leave.student?.name || 'Unknown Student';
                  const initials = studentName.substring(0, 2).toUpperCase();
                  const startDate = new Date(leave.startDate).toLocaleDateString();
                  const endDate = new Date(leave.endDate).toLocaleDateString();
                  const isPending = leave.status?.toUpperCase() === 'PENDING';
                  
                  return (
                    <tr key={leave.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-xs">
                            {initials}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{studentName}</p>
                            <p className="text-xs text-slate-500 font-medium">RFID: {leave.student?.rfidTag || 'N/A'}</p>
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
                          {isPending ? (
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
      </div>
    </div>
  );
}
