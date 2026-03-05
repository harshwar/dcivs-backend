/**
 * Job Service — Reusable Background Job Management
 * 
 * Provides helpers to create, update, complete, and fail background jobs.
 * All heavy operations (NFT issuance, AI scanning, batch ops) use this
 * to report progress that the frontend polls via GET /api/job-status/:jobId.
 */
const supabase = require('../db');

/**
 * Create a new job row in the database.
 * @param {string} type - Job type identifier (e.g., 'issue_nft', 'verify_document')
 * @param {number} totalSteps - Total number of steps in the pipeline
 * @param {object} meta - Input params snapshot for audit/retry
 * @param {number|null} adminId - ID of admin who started the job
 * @returns {string} jobId (UUID)
 */
async function createJob(type, totalSteps, meta = {}, adminId = null) {
    const { data, error } = await supabase
        .from('jobs')
        .insert([{
            type,
            status: 'queued',
            current_step: 0,
            total_steps: totalSteps,
            step_label: 'Initializing...',
            percentage: 0,
            meta,
            created_by: adminId
        }])
        .select('id')
        .single();

    if (error) throw new Error(`Failed to create job: ${error.message}`);
    return data.id;
}

/**
 * Update a job's progress mid-pipeline.
 * @param {string} jobId - UUID of the job
 * @param {number} step - Current step number (1-indexed)
 * @param {string} label - Human-readable description of current step
 * @param {number} percentage - Overall percentage (0-100)
 */
async function updateJobStep(jobId, step, label, percentage) {
    const { error } = await supabase
        .from('jobs')
        .update({
            status: 'processing',
            current_step: step,
            step_label: label,
            percentage: Math.min(100, Math.max(0, percentage)),
            updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

    if (error) console.error(`[JobService] Failed to update job ${jobId}:`, error.message);
}

/**
 * Mark a job as completed with its result data.
 * @param {string} jobId - UUID of the job
 * @param {object} result - Final output (e.g., { txHash, tokenId, ipfsCid })
 */
async function completeJob(jobId, result = {}) {
    const { error } = await supabase
        .from('jobs')
        .update({
            status: 'completed',
            percentage: 100,
            step_label: 'Done',
            result,
            updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

    if (error) console.error(`[JobService] Failed to complete job ${jobId}:`, error.message);
}

/**
 * Mark a job as failed with an error message.
 * @param {string} jobId - UUID of the job
 * @param {string} errorMessage - What went wrong
 */
async function failJob(jobId, errorMessage) {
    const { error } = await supabase
        .from('jobs')
        .update({
            status: 'failed',
            error: errorMessage,
            updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

    if (error) console.error(`[JobService] Failed to mark job ${jobId} as failed:`, error.message);
}

/**
 * Get the current status of a job.
 * @param {string} jobId - UUID of the job
 * @returns {object|null} Job row or null if not found
 */
async function getJobStatus(jobId) {
    const { data, error } = await supabase
        .from('jobs')
        .select('id, type, status, current_step, total_steps, step_label, percentage, error, result, created_at, updated_at')
        .eq('id', jobId)
        .single();

    if (error) {
        console.error(`[JobService] Failed to fetch job ${jobId}:`, error.message);
        return null;
    }
    return data;
}

module.exports = { createJob, updateJobStep, completeJob, failJob, getJobStatus };
