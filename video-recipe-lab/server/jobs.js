// 작업 대기열 — "기다리기" 화면이 SSE 로 진행상황을 받아간다
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { runPipeline, STEPS } from './pipeline/run.js';

const jobs = new Map();

class Job extends EventEmitter {
  constructor() {
    super();
    this.id = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex')}`;
    this.status = 'running';
    this.steps = STEPS.map((s) => ({ ...s, status: 'pending', detail: '' }));
    this.logs = [];
    this.result = null;
    this.error = null;
    this.startedAt = Date.now();
  }
  step(key, status, detail = '') {
    const s = this.steps.find((x) => x.key === key);
    if (s) Object.assign(s, { status, detail });
    this.emit('update', this.snapshot());
  }
  log(msg) {
    this.logs.push(msg);
    this.emit('update', this.snapshot());
  }
  snapshot() {
    const done = this.steps.filter((s) => s.status === 'done').length;
    return {
      id: this.id, status: this.status, steps: this.steps, logs: this.logs, result: this.result, error: this.error,
      progress: Math.round((done / this.steps.length) * 100), elapsed: Math.round((Date.now() - this.startedAt) / 1000),
    };
  }
}

export function startJob(input) {
  const job = new Job();
  jobs.set(job.id, job);
  runPipeline(job, input)
    .then((result) => {
      job.result = result;
      job.status = 'done';
      job.emit('update', job.snapshot());
    })
    .catch((err) => {
      console.error(err);
      const running = job.steps.find((s) => s.status === 'running');
      if (running) running.status = 'error';
      job.status = 'error';
      job.error = String(err.message || err);
      job.emit('update', job.snapshot());
    });
  return job;
}

export const getJob = (id) => jobs.get(id);
