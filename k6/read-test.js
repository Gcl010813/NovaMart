import http from 'k6/http';
import { check, sleep } from 'k6';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

export const options = {
    vus: 50,
    duration: '20s',
    thresholds: {
        http_req_duration: ['p(95)<100'], // 读接口 P95 必须小于 100ms
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    let userId;
    if (Math.random() < 0.8) {
        userId = Math.floor(Math.random() * 200) + 1;
    } else {
        userId = Math.floor(Math.random() * 1000) + 1;
    }
    const res = http.get(`http://localhost:8080/api/users/${userId}`);
    check(res, {
        'status is 200': (r) => r.status === 200,
        'source is redis or mysql': (r) => ['redis', 'mysql'].includes(r.json().source),
    });
    sleep(0.1);
}

export function handleSummary(data) {
    return {
        "k6/reports/read-report.html": htmlReport(data),
        stdout: JSON.stringify(data.metrics),
    };
}