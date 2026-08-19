const fs = require('fs');
const path = require('path');

const manageRoutesPath = path.join(__dirname, 'components/views/ManageRoutes.tsx');
let content = fs.readFileSync(manageRoutesPath, 'utf8');

// 1. Add imports
content = content.replace(
  `import dynamic from 'next/dynamic';`,
  `import dynamic from 'next/dynamic';\nimport toast from 'react-hot-toast';\nimport { SearchableSelect } from '@/components/ui/SearchableSelect';`
);

// 2. Replace handleOpenAssign to extract current trip
content = content.replace(
  `  const handleOpenAssign = (route: any) => {\n    setAssignRouteName(route.name);\n    setAssignFormData({ routeId: route.id, busId: '', driverId: '' });`,
  `  const handleOpenAssign = (route: any) => {\n    const latestTrip = route.trips && route.trips.length > 0 ? route.trips[route.trips.length - 1] : null;\n    setAssignRouteName(route.name);\n    setAssignFormData({ routeId: route.id, busId: latestTrip?.busId || '', driverId: latestTrip?.driverId || '' });`
);

// 3. Replace alerts with toast
content = content.replace(/alert\('Failed to assign driver and bus\. Check IDs and try again\.'\);/g, `toast.error('Failed to assign driver and bus. Check IDs and try again.');`);
content = content.replace(/alert\('Failed to save route\. Please try again\.'\);/g, `toast.error('Failed to save route. Please try again.');`);
content = content.replace(/alert\(err\.message \|\| 'Failed to delete route'\);/g, `toast.error(err.message || 'Failed to delete route');`);
content = content.replace(/alert\(err\.message \|\| 'Failed to cancel trips'\);/g, `toast.error(err.message || 'Failed to cancel trips');`);
content = content.replace(/if \(filteredRoutes\.length === 0\) return alert\('No routes to export'\);/g, `if (filteredRoutes.length === 0) { toast.error('No routes to export'); return; }`);

// Replace confirm() with window.confirm
content = content.replace(/if \(!confirm\(/g, `if (!window.confirm(`);

// 4. Loading skeleton
content = content.replace(
  `  return (\n    <div className="p-6 space-y-6">`,
  `  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/4 mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-slate-100 h-24 rounded-xl border border-slate-200"></div>
          ))}
        </div>
        <div className="bg-slate-100 h-96 rounded-xl border border-slate-200 mt-6"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">`
);

// 5. Replace ghost filters
content = content.replace(
  `<button onClick={() => alert('Advanced filters coming soon.')} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-200 rounded-md transition-colors">`,
  `<button disabled title="Advanced filters coming soon" className="flex items-center gap-1.5 text-xs font-bold text-slate-400 px-3 py-1.5 border border-slate-200 rounded-md bg-slate-50 cursor-not-allowed">`
);

// 6. Action targets and Layout UX
content = content.replace(
  `className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"`,
  `className="flex items-center justify-end gap-2 transition-opacity"`
);

content = content.replace(/p-1\.5/g, 'p-2');
content = content.replace(/size={14}/g, 'size={18}');

// Restore Search icon size in Filters / SearchableSelect if it accidentally got matched, but wait, SearchableSelect is in another file. 
// Filter icon size:
content = content.replace(/<SlidersHorizontal size={18} \/>/g, '<SlidersHorizontal size={14} />');
content = content.replace(/<Download size={18} \/>/g, '<Download size={14} />');
content = content.replace(/<Map size={18} \/>/g, '<Map size={18} />');

// 7. Tooltips for statuses
content = content.replace(
  `                      <span className={clsx(`,
  `                      <span \n                        title={statusStr === 'ACTIVE' || statusStr === 'ON_SCHEDULE' ? 'Route is currently active and running on schedule.' : statusStr === 'DELAYED' ? 'Route is currently experiencing delays.' : statusStr === 'OPTIMIZING' ? 'System is analyzing this route for better efficiency.' : 'Route is planned but not currently active.'}\n                        className={clsx(\n                          "cursor-help",`
);

// 8. Replace native select with SearchableSelect
const selectBusRegex = /<select[\s\S]*?value={assignFormData\.busId}[\s\S]*?<\/select>/;
const selectDriverRegex = /<select[\s\S]*?value={assignFormData\.driverId}[\s\S]*?<\/select>/;

const newSelectBus = `<SearchableSelect 
                  options={buses.map((bus: any) => ({
                    value: bus.id,
                    label: bus.licensePlate,
                    subLabel: bus.capacity ? \`\${bus.capacity} seats\` : undefined
                  }))}
                  value={assignFormData.busId}
                  onChange={(val) => setAssignFormData({...assignFormData, busId: val})}
                  placeholder="Select a bus"
                />`;
                
const newSelectDriver = `<SearchableSelect 
                  options={drivers.map((driver: any) => ({
                    value: driver.id,
                    label: driver.name,
                    subLabel: driver.email
                  }))}
                  value={assignFormData.driverId}
                  onChange={(val) => setAssignFormData({...assignFormData, driverId: val})}
                  placeholder="Select a driver"
                />`;

content = content.replace(selectBusRegex, newSelectBus);
content = content.replace(selectDriverRegex, newSelectDriver);

fs.writeFileSync(manageRoutesPath, content);
console.log('ManageRoutes patched successfully.');
