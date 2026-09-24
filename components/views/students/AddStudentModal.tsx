import React, { useId, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { RouteStopPicker } from './RouteStopPicker';

interface AddStudentModalProps {
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  formData: any;
  setFormData: (data: any) => void;
  isSubmitting: boolean;
  error?: string | null;
  routes?: any[];
  routesLoading?: boolean;
  routesError?: string | null;
  onRetryRoutes?: () => void;
}

export function AddStudentModal({
  onClose, onSubmit, formData, setFormData, isSubmitting, error,
  routes = [], routesLoading = false, routesError, onRetryRoutes,
}: AddStudentModalProps) {
  const id = useId();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fields = [
    { key: 'rfidTag', label: 'Student ID', placeholder: 'e.g. roll or admission number', type: 'text' },
    { key: 'name', label: 'Student Name', placeholder: 'e.g. John Doe', type: 'text', required: true },
    { key: 'grade', label: 'Grade/Class', placeholder: 'e.g. 10th', type: 'text' },
    { key: 'parentName', label: 'Parent Name', placeholder: 'e.g. Mr. Smith', type: 'text', required: true },
    { key: 'parentEmail', label: 'Parent Email', placeholder: 'e.g. alex.parent@example.com', type: 'email', required: true },
    { key: 'guardianPhone', label: 'Guardian Phone', placeholder: 'e.g. 9876543210', type: 'tel' },
  ];
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    const next: Record<string, string> = {};
    if (!formData.name.trim()) next.name = 'Enter the student name.';
    if (!formData.parentName.trim()) next.parentName = 'Enter the parent name.';
    const email = formData.parentEmail.trim();
    const emailInput = event.currentTarget.elements.namedItem('parentEmail') as HTMLInputElement;
    if (!email || emailInput.validity.typeMismatch) next.parentEmail = 'Enter a valid parent email.';
    if (formData.guardianPhone && !/^[0-9]{10}$/.test(formData.guardianPhone)) next.guardianPhone = 'Enter a 10-digit phone number.';
    setErrors(next);
    if (Object.keys(next).length) {
      event.currentTarget.querySelector<HTMLInputElement>('[name="' + Object.keys(next)[0] + '"]')?.focus();
      return;
    }
    onSubmit(event);
  };

  return (
    <Dialog title="Register New Student" onClose={onClose} busy={isSubmitting}>
      <form onSubmit={handleSubmit} noValidate>
        {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <fieldset disabled={isSubmitting} className="min-w-0 space-y-4">
          {fields.map(field => (
            <div key={field.key}>
              <label htmlFor={id + '-' + field.key} className="mb-1 block text-sm font-semibold text-slate-700">
                {field.label}{field.required && <span className="text-red-500" aria-hidden="true"> *</span>}
              </label>
              <input
                id={id + '-' + field.key}
                name={field.key}
                type={field.type}
                required={field.required}
                value={formData[field.key] || ''}
                onChange={event => {
                  setFormData({ ...formData, [field.key]: field.type === 'tel' ? event.target.value.replace(/\D/g, '') : event.target.value });
                  setErrors(current => ({ ...current, [field.key]: '' }));
                }}
                maxLength={field.type === 'tel' ? 10 : undefined}
                inputMode={field.type === 'tel' ? 'numeric' : undefined}
                aria-invalid={!!errors[field.key]}
                aria-describedby={errors[field.key] ? id + '-' + field.key + '-error' : undefined}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500 disabled:bg-slate-50"
                placeholder={field.placeholder}
              />
              {errors[field.key] && <p id={id + '-' + field.key + '-error'} role="alert" className="mt-1 text-sm text-red-700">{errors[field.key]}</p>}
            </div>
          ))}
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-1 text-sm font-semibold text-slate-700">Pickup route &amp; stop</p>
            <p className="mb-3 text-xs text-slate-500">
              Optional \u2014 a child can be registered before their route is decided. Which bus
              collects them follows from the route, so there is no bus to choose here.
            </p>
            <div className="space-y-4">
              <RouteStopPicker
                routes={routes}
                routeId={formData.routeId || ''}
                routeStopId={formData.routeStopId || ''}
                onChange={next => setFormData({ ...formData, ...next })}
                loading={routesLoading}
                error={routesError}
                onRetry={onRetryRoutes}
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-70">
              {isSubmitting ? 'Registering...' : 'Register Student'}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
