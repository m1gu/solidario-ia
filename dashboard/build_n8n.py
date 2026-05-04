import json
import os

html_path = r"d:\GEA\Banco Solidario\Banco Solidario Cobros\dashboard\index.html"
out_path = r"d:\GEA\Banco Solidario\Banco Solidario Cobros\dashboard\Solidario_Dashboard.json"

try:
    with open(html_path, "r", encoding="utf-8") as f:
        html_content = f.read()

    workflow = {
      "name": "Solidario_Dashboard",
      "nodes": [
        {
          "parameters": {
            "httpMethod": "GET",
            "path": "dashboard",
            "responseMode": "responseNode",
            "options": {}
          },
          "id": "e44d320e-6c0b-4ebc-88e5-39d2ec0ce777",
          "name": "Webhook",
          "type": "n8n-nodes-base.webhook",
          "typeVersion": 1,
          "position": [460, 460],
          "webhookId": "09819cd6-5f5c-4cd5-a0ea-73595eb5bc32"
        },
        {
          "parameters": {
            "assignments": {
              "assignments": [
                {
                  "id": "fe9a42f5-b2fb-4ba7-99d9-05d045d65609",
                  "name": "html",
                  "value": html_content,
                  "type": "string"
                }
              ]
            },
            "options": {}
          },
          "id": "e891361b-9447-4cf0-8b17-7eef9f2ccad5",
          "name": "Pega tu Codigo Aqui",
          "type": "n8n-nodes-base.set",
          "typeVersion": 3.4,
          "position": [680, 460]
        },
        {
          "parameters": {
            "respondWith": "text",
            "responseBody": "={{ $json.html }}",
            "options": {
              "responseHeaders": {
                "entries": [
                  {
                    "name": "Content-Type",
                    "value": "text/html; charset=utf-8"
                  }
                ]
              }
            }
          },
          "id": "90e633d4-1f74-4b47-ba2f-f4a4fec21b33",
          "name": "Respond to Webhook",
          "type": "n8n-nodes-base.respondToWebhook",
          "typeVersion": 1.1,
          "position": [900, 460]
        }
      ],
      "pinData": {},
      "connections": {
        "Webhook": {
          "main": [
            [
              {
                "node": "Pega tu Codigo Aqui",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Pega tu Codigo Aqui": {
          "main": [
            [
              {
                "node": "Respond to Webhook",
                "type": "main",
                "index": 0
              }
            ]
          ]
        }
      },
      "active": False,
      "settings": {
        "executionOrder": "v1"
      },
      "versionId": "b6a7ab56-a19f-4db4-913b-b235bbaee5dc",
      "id": "Pz7rL493nN9X5aQc",
      "meta": {
        "instanceId": "cb486fb79bc48da7048737cda3a81765c711a3db64f776ab8a7605d3b6a03197"
      },
      "tags": []
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(workflow, f, indent=2, ensure_ascii=False)

    print(f"\n[Exito] Archivo generado correctamente en:\n{out_path}\n")
except Exception as e:
    print(f"Error: {e}")
