import { EventEmitter } from 'events';
export declare const on: (event: string, listener: (...args: any[]) => void) => EventEmitter;
export declare const off: (event: string, listener: (...args: any[]) => void) => EventEmitter;
export declare const once: (event: string, listener: (...args: any[]) => void) => EventEmitter;
export declare const emit: (event: string, ...args: any[]) => boolean;
