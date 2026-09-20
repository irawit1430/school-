import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AddStudentModal } from '../components/views/students/AddStudentModal';
import { MessageParentModal } from '../components/views/students/MessageParentModal';
import { CredentialsPopup } from '../components/views/students/CredentialsPopup';
import { AssignBusModal } from '../components/views/students/AssignBusModal';
import { StudentDialog } from '../components/views/students/StudentDialog';
import { StudentProfileModal } from '../components/views/students/StudentProfileModal';
import { ImportStudentsModal } from '../components/views/students/ImportStudentsModal';
import { toast } from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no native dialog implementation; browser focus trapping is not simulated.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

const render = async (ui: React.ReactNode) => { await act(async () => root.render(ui)); };
const submit = async () => { await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); };
const button = (text: string) => {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
};
const validStudent = { name: 'Asha', rfidTag: '', grade: '5', parentName: 'Rani', parentEmail: 'rani@example.test', guardianPhone: '' };
const student = { id: 'student-1', name: 'Asha', parentId: 'parent-1', parentName: 'Rani', parentEmail: 'rani@example.test' };

test('registration rejects whitespace-only required names with associated inline errors', async () => {
  const onSubmit = vi.fn();
  await render(<AddStudentModal onClose={vi.fn()} onSubmit={onSubmit} formData={{ ...validStudent, name: '   ', parentName: '\t' }} setFormData={vi.fn()} isSubmitting={false} />);
  await submit();
  expect(onSubmit).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Enter the student name.');
  const invalid = host.querySelector<HTMLInputElement>('input[aria-invalid="true"]')!;
  expect(document.getElementById(invalid.getAttribute('aria-describedby')!)?.textContent).toContain('Enter the student name.');
});

test('messaging refuses missing parent accounts and blank-looking drafts', async () => {
  const onSubmit = vi.fn();
  const props = { onClose: vi.fn(), onSubmit, setMessageForm: vi.fn(), isMessageSubmitting: false };
  await render(<MessageParentModal {...props} messageStudent={{ ...student, parentId: undefined }} messageForm={{ subject: 'Update', body: 'Pickup changed' }} />);
  await submit();
  expect(onSubmit).not.toHaveBeenCalled();
  expect(button('Send Message').disabled).toBe(true);
  expect(host.textContent).toContain('No parent account is linked');
  await render(<MessageParentModal {...props} messageStudent={student} messageForm={{ subject: '  ', body: '\n' }} />);
  await submit();
  expect(onSubmit).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Enter a subject.');
  expect(host.textContent).toContain('rani@example.test');
});

test('credentials wait for clipboard completion and remain available after failure', async () => {
  let rejectCopy!: (error: Error) => void;
  const writeText = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectCopy = reject; }));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const setCredentialsPopup = vi.fn();
  await render(<CredentialsPopup credentialsPopup={{ email: 'rani@example.test', temporaryPassword: 'temporary-test-value' }} setCredentialsPopup={setCredentialsPopup} />);
  await act(async () => button('Copy All').click());
  expect(toast.success).not.toHaveBeenCalled();
  await act(async () => rejectCopy(new Error('Permission denied')));
  expect(host.textContent).toContain('Copy failed');
  expect(host.textContent).toContain('temporary-test-value');
  expect(setCredentialsPopup).not.toHaveBeenCalled();
});

test('assignment distinguishes loading, retryable failures, and routes with no stops', async () => {
  const retry = vi.fn();
  const props = { onClose: vi.fn(), onSubmit: vi.fn(), assignStudent: student, assignFormData: { routeId: 'route-1', routeStopId: '' }, setAssignFormData: vi.fn(), isAssignSubmitting: false, routes: [{ id: 'route-1', name: 'North Route', stops: [] }], onRetryRoutes: retry };
  await render(<AssignBusModal {...props} routesLoading />);
  expect(host.textContent).toContain('Loading pickup routes and stops');
  expect(button('Save Route & Stop').disabled).toBe(true);
  await render(<AssignBusModal {...props} routesError="Routes unavailable" />);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Routes unavailable');
  await act(async () => button('Retry loading routes').click());
  expect(retry).toHaveBeenCalledOnce();
  await render(<AssignBusModal {...props} />);
  expect(host.textContent).toContain('No pickup stops are configured for this route.');
  await submit();
  expect(props.onSubmit).not.toHaveBeenCalled();
});

test('native dialog has a named title, restores focus, and blocks all dismissal paths while busy', async () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const onClose = vi.fn();
  const ui = (busy: boolean) => <StudentDialog title="Test dialog" onClose={onClose} busy={busy}><input aria-label="Test value" /></StudentDialog>;
  await render(ui(true));
  const dialog = host.querySelector('dialog')!;
  expect(dialog.open).toBe(true);
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Test dialog');
  expect(document.activeElement?.textContent).toBe('Test dialog');
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ left: 20, top: 20, right: 420, bottom: 420 } as DOMRect);
  const backdropClick = async () => {
    await act(async () => {
      dialog.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }));
      dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
    });
  };
  const cancel = new Event('cancel', { cancelable: true });
  await act(async () => { dialog.dispatchEvent(cancel); });
  await backdropClick();
  const closeButton = host.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!;
  await act(async () => closeButton.click());
  expect(cancel.defaultPrevented).toBe(true);
  expect(closeButton.disabled).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
  await render(ui(false));
  await backdropClick();
  expect(onClose).toHaveBeenCalledOnce();
  await render(null);
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});

test('pending registration locks fields and all controls that close the form', async () => {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  await render(<AddStudentModal onClose={onClose} onSubmit={onSubmit} formData={validStudent} setFormData={vi.fn()} isSubmitting />);
  expect([...host.querySelectorAll('input')].every(input => input.matches(':disabled'))).toBe(true);
  expect(button('Cancel').disabled).toBe(true);
  await submit();
  await act(async () => button('Cancel').click());
  expect(onClose).not.toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('import credentials name the operation and require explicit Done even for one account', async () => {
  const setCredentialsPopup = vi.fn();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  await render(<CredentialsPopup operation="import" importedCount={5} credentialsPopup={[{ email: 'rani@example.test', temporaryPassword: 'temporary-test-value' }]} setCredentialsPopup={setCredentialsPopup} />);
  expect(host.textContent).toContain('Students Imported!');
  expect(host.textContent).toContain('5 students were imported.');
  expect(host.querySelector('[aria-label="Close dialog"]')).toBeNull();
  await act(async () => { host.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })); });
  expect(setCredentialsPopup).not.toHaveBeenCalled();
  await act(async () => button('Copy All').click());
  expect(writeText).toHaveBeenCalledWith('Email: rani@example.test\nPassword: temporary-test-value');
  expect(toast.success).toHaveBeenCalledOnce();
  await act(async () => button('Done').click());
  expect(setCredentialsPopup).toHaveBeenCalledExactlyOnceWith(null);
});

test('student profile shows the saved pickup stop, time, and linked guardian details', async () => {
  await render(<StudentProfileModal viewStudent={{ ...student, route: 'North Route', stopName: 'Library Gate', stopTime: '07:15', guardianPhone: '9876543210', status: 'On leave', time: '—' }} onClose={vi.fn()} />);
  expect(host.textContent).toContain('Library Gate');
  expect(host.textContent).toContain('07:15');
  expect(host.textContent).toContain('Rani');
  expect(host.textContent).toContain('9876543210');
  const status = [...host.querySelectorAll('dd')].find(node => node.textContent === 'On leave')!;
  expect(status).toBeTruthy();
  expect(status.querySelector('span')?.className).toContain('bg-purple-50');
});

test('assignment rejects a stale stop from another route and submits only a current selection', async () => {
  const onSubmit = vi.fn();
  const route = { id: 'route-1', name: 'North Route', stops: [{ id: 'stop-1', name: 'Library Gate', stopTime: '07:15' }] };
  const props = { onClose: vi.fn(), onSubmit, assignStudent: student, setAssignFormData: vi.fn(), isAssignSubmitting: false, routes: [route] };
  await render(<AssignBusModal {...props} assignFormData={{ routeId: 'route-1', routeStopId: 'stale-stop' }} />);
  await submit();
  expect(onSubmit).not.toHaveBeenCalled();
  expect(button('Save Route & Stop').disabled).toBe(true);
  await render(<AssignBusModal {...props} assignFormData={{ routeId: 'route-1', routeStopId: 'stop-1' }} />);
  await submit();
  expect(onSubmit).toHaveBeenCalledOnce();
});

const chooseCSV = async (text: string) => {
  const file = new File([text], 'students.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => text });
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  return file;
};

test('import preview maps reordered headers correctly and submits the reviewed file', async () => {
  const onImport = vi.fn().mockResolvedValue(undefined);
  await render(<ImportStudentsModal onClose={vi.fn()} onImport={onImport} isSubmitting={false} />);
  const file = await chooseCSV('Parent Name,Student Name,Roll Number,Phone\nRani,Asha,001,9876543210');
  expect(host.textContent).toContain('1 total rows');
  const cells = [...host.querySelectorAll('tbody td')].map(cell => cell.textContent);
  expect(cells).toEqual(['Asha', '001', 'Rani', '9876543210']);
  await submit();
  expect(onImport).toHaveBeenCalledExactlyOnceWith(file);
});

test('import preview reports invalid rows and blocks the entire file', async () => {
  const onImport = vi.fn();
  await render(<ImportStudentsModal onClose={vi.fn()} onImport={onImport} isSubmitting={false} />);
  await chooseCSV('name,rollNumber,guardianName,guardianPhone\nAsha,1,Rani,9876543210\nBina,,Parent,9876543210');
  expect(host.textContent).toContain('2 total rows');
  expect(host.textContent).toContain('1 rows needing correction');
  expect(host.textContent).toContain('Line 3: rollNumber is required.');
  expect(button('Import students').disabled).toBe(true);
  await submit();
  expect(onImport).not.toHaveBeenCalled();
});

test('ignored import fields require acknowledgement and a rejected import retains the preview', async () => {
  const onImport = vi.fn().mockRejectedValue(new Error('Roll number already exists'));
  await render(<ImportStudentsModal onClose={vi.fn()} onImport={onImport} isSubmitting={false} />);
  await chooseCSV('name,rollNumber,guardianName,guardianPhone,grade\nAsha,1,Rani,9876543210,5');
  expect(button('Import 1 student').disabled).toBe(true);
  await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  expect(button('Import 1 student').disabled).toBe(false);
  await submit();
  expect(host.textContent).toContain('Roll number already exists');
  expect(host.querySelector('tbody')!.textContent).toContain('Asha');
  expect(button('Import 1 student').disabled).toBe(false);
});

test('registration offers a pickup stop but never blocks on one', async () => {
  const onSubmit = vi.fn();
  const setFormData = vi.fn();
  const routes = [{ id: 'route-1', name: 'North Route', stops: [{ id: 'stop-1', name: 'Gandhi Chowk', stopTime: '07:20' }] }];
  const props = { onClose: vi.fn(), onSubmit, setFormData, isSubmitting: false, routes };

  // A child can be admitted before their route is decided, so no stop must still submit.
  await render(<AddStudentModal {...props} formData={{ ...validStudent, routeId: '', routeStopId: '' }} />);
  expect(host.textContent).toContain('Pickup route & stop');
  // There is deliberately no bus to pick — the bus follows from the route's trips.
  expect(host.textContent).not.toContain('Select Bus');
  expect(host.querySelector<HTMLSelectElement>('select[name="routeStopId"]')).toBeNull();
  await submit();
  expect(onSubmit).toHaveBeenCalledOnce();

  // Choosing a route reveals its stops and reports both ids back to the form.
  await render(<AddStudentModal {...props} formData={{ ...validStudent, routeId: 'route-1', routeStopId: '' }} />);
  const stopSelect = host.querySelector<HTMLSelectElement>('select[name="routeStopId"]')!;
  expect(stopSelect.textContent).toContain('Gandhi Chowk');
  await act(async () => {
    stopSelect.value = 'stop-1';
    stopSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(setFormData).toHaveBeenCalledWith(expect.objectContaining({ routeId: 'route-1', routeStopId: 'stop-1' }));
});

test('a broken routes list never stops a student being registered', async () => {
  const onSubmit = vi.fn();
  const retry = vi.fn();
  await render(<AddStudentModal
    onClose={vi.fn()} onSubmit={onSubmit} setFormData={vi.fn()} isSubmitting={false}
    formData={{ ...validStudent, routeId: '', routeStopId: '' }}
    routes={[]} routesError="Routes unavailable" onRetryRoutes={retry}
  />);
  expect(host.textContent).toContain('Routes unavailable');
  await act(async () => button('Retry loading routes').click());
  expect(retry).toHaveBeenCalledOnce();
  // The stop is optional, so a routes outage must not hold up the registration itself.
  await submit();
  expect(onSubmit).toHaveBeenCalledOnce();
});
