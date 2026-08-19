const fs = require('fs');
const path = require('path');

const editorPath = path.join(__dirname, 'components/map/RouteMapEditor.tsx');
let content = fs.readFileSync(editorPath, 'utf8');

// 1. imports
content = content.replace(
  `import { GripVertical } from 'lucide-react';`,
  `import { GripVertical } from 'lucide-react';\nimport { SearchableSelect } from '@/components/ui/SearchableSelect';`
);

// 2. State initialization
const oldState = `  // Assigment state for new routes\n  const [selectedBusId, setSelectedBusId] = useState('');\n  const [selectedDriverId, setSelectedDriverId] = useState('');`;
const newState = `  // Assignment state\n  const latestTrip = initialRoute?.trips?.[initialRoute?.trips?.length - 1];\n  const [selectedBusId, setSelectedBusId] = useState(latestTrip?.busId || '');\n  const [selectedDriverId, setSelectedDriverId] = useState(latestTrip?.driverId || '');`;
content = content.replace(oldState, newState);

// 3. Conditional block for assignments
const regexAssign = /\{\!initialRoute && buses && drivers && \([\s\S]*?\}\)/;
const replacementAssign = `{buses && drivers && (
          <>
            <div className="flex flex-col gap-2 relative">
              <SearchableSelect 
                  label="Assign Bus (Optional)"
                  options={buses.map((bus: any) => ({
                    value: bus.id,
                    label: bus.licensePlate,
                    subLabel: bus.capacity ? \`\${bus.capacity} seats\` : undefined
                  }))}
                  value={selectedBusId}
                  onChange={(val) => setSelectedBusId(val)}
                  placeholder="Select a bus"
                />
            </div>
            <div className="flex flex-col gap-2 relative">
              <SearchableSelect 
                  label="Assign Driver (Optional)"
                  options={drivers.map((driver: any) => ({
                    value: driver.id,
                    label: driver.name,
                    subLabel: driver.email
                  }))}
                  value={selectedDriverId}
                  onChange={(val) => setSelectedDriverId(val)}
                  placeholder="Select a driver"
                />
            </div>
          </>
        )}`;
content = content.replace(regexAssign, replacementAssign);

// 4. Update save logic to handle updates
const oldSaveLogic = `      if (initialRoute?.id) {
        await updateRoute(initialRoute.id, {
          name,
          estimatedDuration: osrm?.durationMin ?? null,
          distanceKm: osrm?.distanceKm ?? null,
          geometry: osrm?.geometry ?? null,
        });
        toast.success('Route updated');`;
      
const newSaveLogic = `      if (initialRoute?.id) {
        await updateRoute(initialRoute.id, {
          name,
          estimatedDuration: osrm?.durationMin ?? null,
          distanceKm: osrm?.distanceKm ?? null,
          geometry: osrm?.geometry ?? null,
        });
        
        if (selectedBusId && selectedDriverId && (selectedBusId !== latestTrip?.busId || selectedDriverId !== latestTrip?.driverId)) {
          await createTrip({
            routeId: initialRoute.id,
            busId: selectedBusId,
            driverId: selectedDriverId
          });
        }
        toast.success('Route updated');`;
content = content.replace(oldSaveLogic, newSaveLogic);

// 5. Validation inline warning
const oldFooter = `<div className="flex justify-end items-center gap-3 pt-4 border-t border-slate-100">
        <button
          onClick={onCancel}`;
const newFooter = `<div className="flex justify-end items-center gap-3 pt-4 border-t border-slate-100">
        {(!name.trim() || stops.length < 2) && (
          <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-1 rounded border border-red-100">
            * Route name and at least 2 stops required
          </span>
        )}
        <button
          onClick={onCancel}`;
content = content.replace(oldFooter, newFooter);

fs.writeFileSync(editorPath, content);
console.log('RouteMapEditor patched successfully.');
