import { registerSW } from 'virtual:pwa-register';

export function registerServiceWorker() {
  registerSW({
    immediate: true,
    onOfflineReady() {
      console.info('App ready to work offline');
    }
  });
}
