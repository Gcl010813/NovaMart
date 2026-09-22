USE novamart;

-- 1. 插入 1000 个用户
INSERT INTO
    users (
        username,
        password,
        email,
        phone
    )
SELECT CONCAT('user_', n), 'pass123', CONCAT('user_', n, '@novamart.com'), CONCAT('138', LPAD(n, 8, '0'))
FROM (
        SELECT a.N + b.N * 10 + c.N * 100 + d.N * 1000 + 1 AS n
        FROM (
                SELECT 0 AS N
                UNION
                SELECT 1
                UNION
                SELECT 2
                UNION
                SELECT 3
                UNION
                SELECT 4
                UNION
                SELECT 5
                UNION
                SELECT 6
                UNION
                SELECT 7
                UNION
                SELECT 8
                UNION
                SELECT 9
            ) a
            CROSS JOIN (
                SELECT 0 AS N
                UNION
                SELECT 1
                UNION
                SELECT 2
                UNION
                SELECT 3
                UNION
                SELECT 4
                UNION
                SELECT 5
                UNION
                SELECT 6
                UNION
                SELECT 7
                UNION
                SELECT 8
                UNION
                SELECT 9
            ) b
            CROSS JOIN (
                SELECT 0 AS N
                UNION
                SELECT 1
                UNION
                SELECT 2
                UNION
                SELECT 3
                UNION
                SELECT 4
                UNION
                SELECT 5
                UNION
                SELECT 6
                UNION
                SELECT 7
                UNION
                SELECT 8
                UNION
                SELECT 9
            ) c
            CROSS JOIN (
                SELECT 0 AS N
                UNION
                SELECT 1
                UNION
                SELECT 2
            ) d
    ) t;

-- 2. 插入 500 个商品
INSERT INTO
    products (name, price, stock)
SELECT CONCAT('NovaPhone_', n), ROUND(RAND() * 5000 + 500, 2), 10000
FROM (
        SELECT a.N + b.N * 10 + c.N * 100 + 1 AS n
        FROM (
                SELECT 0 AS N
                UNION
                SELECT 1
                UNION
                SELECT 2
                UNION
                SELECT 3
                UNION
                SELECT 4
                UNION
                SELECT 5
                UNION
                SELECT 6
                UNION
                SELECT 7
                UNION
                SELECT 8
                UNION
                SELECT 9
            ) a
            CROSS JOIN (
                SELECT 0 AS N
                UNION
                SELECT 1
                UNION
                SELECT 2
                UNION
                SELECT 3
                UNION
                SELECT 4
                UNION
                SELECT 5
                UNION
                SELECT 6
                UNION
                SELECT 7
                UNION
                SELECT 8
                UNION
                SELECT 9
            ) b
            CROSS JOIN (
                SELECT 0 AS N
                UNION
                SELECT 1
                UNION
                SELECT 2
                UNION
                SELECT 3
                UNION
                SELECT 4
            ) c
    ) t;