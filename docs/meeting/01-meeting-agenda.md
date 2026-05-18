# Meeting Agenda - BE/FE DukyBoot MVP

## Muc tieu buoi hop

- Team BE va FE hieu cung mot scope MVP.
- Chot flow ban hang bat buoc phai chay duoc.
- Chot API contract va cac diem con dang mo.
- Chot owner, deadline, dependency va cach report bug.
- Xac dinh viec nao thuoc MVP, viec nao de sau.

## Thanh phan nen co

- PM/BA: dieu phoi, chot scope, ghi decision.
- BE lead/dev: xac nhan API, business rule, data source.
- FE lead/dev: xac nhan page, route, state, integration.
- QA/tester neu co: xac nhan checklist nghiem thu.
- Owner/project stakeholder neu co: chot uu tien va trade-off.

## Agenda de xuat

| Thoi luong | Noi dung | Ket qua can co |
|---|---|---|
| 10 phut | Tong quan san pham va MVP | Team hieu muc tieu: web ban hang guest checkout |
| 15 phut | Scope P0/P1/P2 | Chot cai gi lam ngay, cai gi de sau |
| 20 phut | User flow mua hang | Chot homepage -> product -> cart -> checkout -> success -> tracking |
| 30 phut | BE/FE API handoff | Chot endpoint, response, pagination, error, env |
| 20 phut | Task owner va timeline | Chot ai lam gi, deadline nao, dependency nao |
| 15 phut | QA/UAT va bug process | Chot checklist test va cach ghi bug |
| 10 phut | Risk/open questions | Chot nguoi follow va deadline tra loi |

## Cau hoi can chot trong buoi hop

- Product variant MVP co bat buoc khong, hay fallback simple product neu API chua san sang?
- Cart guest dung session/cookie/header nao?
- Phi ship MVP tinh co dinh, cau hinh trong settings, hay backend tinh theo rule?
- Checkout response tra `orderCode` va thong tin thanh toan theo format nao?
- Order status hien thi cho khach gom nhung trang thai nao?
- Homepage content lay tu API nao, fallback ra sao neu thieu banner/category/product?
- Deploy preview dung API base URL nao?

## Output sau buoi hop

- Update `DUKY_CLIENT_MVP_TASK_SHEET.csv` neu co thay doi owner/deadline/scope.
- Update `FE-API-CONTRACT.md` neu co thay doi API.
- Update `06-risk-issue-decision-log.md` voi decision va open issue.

