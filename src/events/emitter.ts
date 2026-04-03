import { EventEmitter } from 'events';

const emitter = new EventEmitter();

export const on = (event: string, listener: (...args: any[]) => void): EventEmitter => emitter.on(event, listener);
export const off = (event: string, listener: (...args: any[]) => void): EventEmitter => emitter.off(event, listener);
export const once = (event: string, listener: (...args: any[]) => void): EventEmitter => emitter.once(event, listener);
export const emit = (event: string, ...args: any[]): boolean => emitter.emit(event, ...args);
