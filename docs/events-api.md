# Events API

Swagger no está instalado en este proyecto, así que esta documentación cubre manualmente los endpoints expuestos por `EventsController`.

## POST /events

Registra un evento en la tabla correspondiente según `action`.

### Request

```http
POST /events
Content-Type: application/json
```

```json
{
  "source": "service-a",
  "entity": "orders",
  "action": "CREATE",
  "title": "Order created",
  "description": "High-level event description",
  "payload": {
    "orderId": 123,
    "currency": "USD"
  }
}
```

### Responses

`200 OK`

```json
{
  "ok": true,
  "id": 42
}
```

`400 Bad Request`

Ejemplos de causas:

- `action` fuera de `CREATE | UPDATE | DELETE | QUERY`.
- `payload` mayor a 8KB.
- `source`, `entity` o `title` no cumplen la validación del DTO.

```json
{
  "statusCode": 400,
  "message": [
    "action must be one of the following values: CREATE, UPDATE, DELETE, QUERY"
  ],
  "error": "Bad Request"
}
```

## GET /events

Devuelve todos los eventos agregados desde las tablas `create_events`, `update_events`, `delete_events` y `query_events`.

### Request

```http
GET /events
```

### Responses

`200 OK`

```json
[
  {
    "id": 42,
    "source": "service-a",
    "entity": "orders",
    "action": "CREATE",
    "title": "Order created",
    "description": "High-level event description",
    "payload": "{\"orderId\":123,\"currency\":\"USD\"}",
    "occurred_at": "2026-07-26T12:34:56.000Z"
  }
]
```

`400 Bad Request`

Este endpoint no recibe parámetros y no debería emitir validaciones de entrada en condiciones normales.

## GET /events/source/:source

Filtra eventos por `source`.

La normalización aplicada en backend es la misma que para `entity`: se hace `trim()`, se rechazan valores vacíos, se limita a 60 caracteres y se bloquean caracteres de control.

### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| source | path | string | yes | Origen del evento |

### Request

```http
GET /events/source/service-a
```

### Responses

`200 OK`

```json
[
  {
    "id": 42,
    "source": "service-a",
    "entity": "orders",
    "action": "CREATE",
    "title": "Order created",
    "description": "High-level event description",
    "payload": "{\"orderId\":123}",
    "occurred_at": "2026-07-26T12:34:56.000Z"
  }
]
```

`400 Bad Request`

```json
{
  "statusCode": 400,
  "message": "source es obligatorio",
  "error": "Bad Request"
}
```

## GET /events/entity/:entity

Filtra eventos por `entity` usando la misma normalización que `source`.

### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| entity | path | string | yes | Entidad afectada por el evento |

### Request

```http
GET /events/entity/orders
```

### Responses

`200 OK`

```json
[
  {
    "id": 42,
    "source": "service-a",
    "entity": "orders",
    "action": "CREATE",
    "title": "Order created",
    "description": "High-level event description",
    "payload": "{\"orderId\":123}",
    "occurred_at": "2026-07-26T12:34:56.000Z"
  }
]
```

`400 Bad Request`

```json
{
  "statusCode": 400,
  "message": "entity es obligatorio",
  "error": "Bad Request"
}
```