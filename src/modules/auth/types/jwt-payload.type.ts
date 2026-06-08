export type JwtPayload = {
  sub: string;
  email: string;
  roles: string[];
  // permissions được tra cứu từ DB trong validateJwtPayload thay vì nhồi vào JWT
  // để giữ token nhỏ gọn (tránh vượt giới hạn 4KB cookie)
};
