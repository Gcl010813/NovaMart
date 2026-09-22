import http from 'k6/http';
import { check } from 'k6';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

export const options = {
    vus: 50,
    duration: '20s',
    thresholds: {
        http_req_duration: ['p(95)<500'],
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    const payload = JSON.stringify({
        userId: Math.floor(Math.random() * 1000) + 1,
        productId: Math.floor(Math.random() * 500) + 1,
        quantity: 1,
    });
    const res = http.post('http://localhost:8080/api/order/sync', payload, {
        headers: { 'Content-Type': 'application/json' },
    });
    check(res, { 'status is 200': (r) => r.status === 200 });
}

export function handleSummary(data) {
    return {
        "k6/reports/sync-order-report.html": htmlReport(data),
        stdout: JSON.stringify(data.metrics),
    };
}