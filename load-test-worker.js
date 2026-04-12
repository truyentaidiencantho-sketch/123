import http from 'k6/http';
import { sleep } from 'k6';

const vus = Number(__ENV.VUS || 50);
const duration = __ENV.DURATION || '1m';

export const options = {
  vus,
  duration,
};

export default function () {
  http.get('https://truyentai-drive-proxy.truyentaidiencantho.workers.dev/listDriveFiles?rootKey=ads');
  sleep(1);
}


// k6 run -e VUS=50 -e DURATION=1m C:\Users\pn404\Downloads\123-main\load-test-worker.js
// k6 run -e VUS=100 -e DURATION=1m C:\Users\pn404\Downloads\123-main\load-test-worker.js
// k6 run -e VUS=200 -e DURATION=1m C:\Users\pn404\Downloads\123-main\load-test-worker.js
// k6 run -e VUS=300 -e DURATION=1m C:\Users\pn404\Downloads\123-main\load-test-worker.js
// k6 run -e VUS=400 -e DURATION=1m C:\Users\pn404\Downloads\123-main\load-test-worker.js
// k6 run -e VUS=500 -e DURATION=1m C:\Users\pn404\Downloads\123-main\load-test-worker.js
