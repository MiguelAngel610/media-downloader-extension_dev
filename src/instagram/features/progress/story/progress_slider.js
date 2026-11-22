/**
 * @fileoverview The custom story slider: creation, drag handling (so Instagram does not treat a drag
 * as a tap to the next story) and seeking of the story's media and CSS/Web Animations.
 */
import { getActiveStoryMedias } from './active_media.js';
import { PROGRESS_CONTAINER_ID } from './segment_row.js';
import { horizontalOffsetFromCenter } from '../../../utils/viewport.js';

export const SLIDER_ID = 'md-story-slider';
export const COUNTER_ID = 'md-story-counter';

const STORY_SCOPE_SELECTOR = 'section, div[role="dialog"], main, ._aa61';
const ANIMATION_MAX_CENTER_OFFSET_PX = 400;
const ANIMATION_MIN_DURATION_MS = 1500; // shorter ones are UI transitions, not the story timer
const ANIMATION_MAX_DURATION_MS = 100000;
const REPLAY_BELOW_PERCENT = 99;
// Explicit for touch listeners; harmless here (the default is already false on plain elements, MDN).
const NON_PASSIVE = { passive: false, capture: false };

/** @param {Element} target @returns {boolean} rendered inside the centred story column */
function isInCentredStory(target) {
    if (!target.closest(STORY_SCOPE_SELECTOR)) return false;
    const rect = target.getBoundingClientRect ? target.getBoundingClientRect() : null;
    return Boolean(rect) && rect.width !== 0 && rect.height !== 0 && horizontalOffsetFromCenter(rect) < ANIMATION_MAX_CENTER_OFFSET_PX;
}

/**
 * @param {AnimationEffect} effect
 * @returns {number | null} finite duration in ms (infinite/looping animations are not story timers)
 */
function finiteDuration(effect) {
    const timing = effect.getComputedTiming ? effect.getComputedTiming() : (effect.getTiming ? effect.getTiming() : null);
    const duration = timing ? timing.duration : null;
    const isFinite = typeof duration === 'number' && !isNaN(duration) && duration > 0 && duration < ANIMATION_MAX_DURATION_MS;
    return isFinite ? duration : null;
}

/**
 * Story-timer animations: anything inside the segment row, or long running animations in the
 * centred story column.
 * @param {Animation} animation
 * @param {Element | null} segmentRow
 * @returns {number | null} duration in ms when the animation should follow the slider
 */
function seekableDuration(animation, segmentRow) {
    const target = animation.effect ? animation.effect.target : null;
    if (!target) return null;
    const isSegmentAnimation = Boolean(segmentRow) && segmentRow.contains(target);
    if (!isSegmentAnimation && !isInCentredStory(target)) return null;
    const duration = finiteDuration(animation.effect);
    if (duration === null || isSegmentAnimation) return duration;
    const isActive = animation.playState === 'running' || animation.playState === 'paused';
    return duration >= ANIMATION_MIN_DURATION_MS && isActive ? duration : null;
}

/**
 * @param {number} percent - 0..100
 * @param {Element} container - our progress container (its parent is the segment row)
 */
function seekStory(percent, container) {
    for (const media of getActiveStoryMedias()) {
        if (!isNaN(media.duration) && media.duration > 0) media.currentTime = (percent / 100) * media.duration;
    }
    if (!document.getAnimations) return;
    for (const animation of document.getAnimations()) {
        const duration = seekableDuration(animation, container.parentElement);
        if (duration === null) continue;
        animation.currentTime = (percent / 100) * duration; // ms (Web Animations API)
        if (animation.playState === 'finished' && percent < REPLAY_BELOW_PERCENT) {
            try {
                animation.play();
            } catch (err) {
                window.MDErrorReporter.reportError('IG Story Progress: resume animation', err);
            }
        }
    }
}

/** Ends a drag even when the pointer is released outside the slider (registered once per page). */
function attachGlobalDragEnd() {
    if (window.__md_storyGlobalListenersAttached) return;
    window.__md_storyGlobalListenersAttached = true;
    const endDrag = () => {
        const slider = document.querySelector(`#${SLIDER_ID}`);
        if (slider) slider.__md_isDragging = false;
    };
    for (const type of ['mouseup', 'pointerup', 'touchend']) window.addEventListener(type, endDrag, false);
}

/** @param {HTMLInputElement} slider @param {Element} container */
function attachSliderListeners(slider, container) {
    const startDrag = (event) => {
        slider.__md_isDragging = true;
        event.stopPropagation();
    };
    slider.addEventListener('mousedown', startDrag, false);
    slider.addEventListener('pointerdown', startDrag, false);
    slider.addEventListener('touchstart', startDrag, NON_PASSIVE);

    const stopMove = (event) => event.stopPropagation();
    slider.addEventListener('pointermove', stopMove, false);
    slider.addEventListener('touchmove', stopMove, NON_PASSIVE);

    const endDrag = () => { slider.__md_isDragging = false; };
    for (const type of ['mouseup', 'pointerup', 'touchend', 'pointercancel', 'touchcancel', 'change', 'blur']) slider.addEventListener(type, endDrag, false);
    attachGlobalDragEnd();

    slider.addEventListener('click', (event) => event.stopPropagation(), false);
    slider.addEventListener('focus', (event) => event.target.blur(), false); // keyboard focus would steal Instagram's arrow keys
    slider.addEventListener('input', (event) => {
        const percent = parseFloat(event.target.value);
        event.target.style.setProperty('--md-progress', `${percent}%`);
        seekStory(percent, container);
    });
}

/** @returns {HTMLInputElement} */
function createSlider() {
    const slider = document.createElement('input');
    Object.assign(slider, { type: 'range', id: SLIDER_ID, min: '0', max: '100', step: '0.1', value: '0', tabIndex: -1 });
    return slider;
}

/** @returns {HTMLDivElement} */
function createCounter() {
    const counter = document.createElement('div');
    counter.id = COUNTER_ID;
    counter.textContent = ''; // a dummy '1/1' would trip the story completion guards (story_resume.js)
    counter.dataset.ready = 'false';
    return counter;
}

/**
 * @param {Element} segmentRow
 * @returns {Element} our container inside the row, created (and any stale copy removed) when missing
 */
export function ensureProgressContainer(segmentRow) {
    const existing = segmentRow.querySelector(`#${PROGRESS_CONTAINER_ID}`);
    if (existing) return existing;
    document.querySelectorAll(`#${PROGRESS_CONTAINER_ID}`).forEach((stale) => stale.remove());

    const container = document.createElement('div');
    container.id = PROGRESS_CONTAINER_ID;
    const slider = createSlider();
    container.appendChild(slider);
    container.appendChild(createCounter());
    if (window.getComputedStyle(segmentRow).position === 'static') segmentRow.style.position = 'relative';
    segmentRow.appendChild(container);
    attachSliderListeners(slider, container);
    container.classList.add('md-visible');
    return container;
}
