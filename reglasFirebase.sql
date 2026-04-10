//rules_version = '2';
//service cloud.firestore {
//  match /databases/{database}/documents {
    // Permitir TODO (lectura y escritura) - SOLO PARA EJECUTAR EL SCRIPT
//    match /{document=**} {
//      allow read, write: if true;
//    }
//  }
//}

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // ============================================================
    // USUARIOS - Solo lectura para autenticación
    // ============================================================
    match /usuarios/{document} {
      allow read: if true;
      allow write: if false;  // Solo lectura, no escritura desde la app
    }
    
    // ============================================================
    // CATEGORIAS - permitir lectura (para el dropdown)
    // ============================================================
    match /categorias/{document} {
      allow read: if true;
      allow write: if false;
    }
    
    // ============================================================
    // MEDICAMENTOS
    // ============================================================
    match /medicamentos/{document} {
      allow read: if true;
      allow write: if true;
      
      // Validar campos obligatorios al crear/actualizar
      allow create: if request.resource.data.nombre is string &&
                      request.resource.data.nombre != "" &&
                      request.resource.data.cantidad is number &&
                      request.resource.data.vencimiento is string &&
                      request.resource.data.activo is bool;
      
      // Validar que cantidad no sea negativa
      allow update: if request.resource.data.cantidad >= 0;
    }
    
    // ============================================================
    // ENTREGAS
    // ============================================================
    match /entregas/{document} {
      allow read: if true;
      allow write: if true;
      
      // Validar estructura de items al crear
      allow create: if request.resource.data.items is list &&
                      request.resource.data.items.size() > 0 &&
                      request.resource.data.fecha is string &&
                      request.resource.data.destino is string;
      
      // Validar que cada item tenga los campos necesarios
      allow write: if request.resource.data.items.hasOnly([
        'medicamentoId', 'nombre', 'presentacion', 'cantidad', 'vencimiento', 'ubicacion'
      ]);
    }
    
    // ============================================================
    // PEDIDOS
    // ============================================================
    match /pedidos/{document} {
      allow read: if true;
      allow write: if true;
      
      // Validar estructura al crear
      allow create: if request.resource.data.nombreSolicitante is string &&
                      request.resource.data.nombreSolicitante != "" &&
                      request.resource.data.medicamentosSolicitados is list &&
                      request.resource.data.medicamentosSolicitados.size() > 0 &&
                      request.resource.data.atendido is bool &&
                      request.resource.data.fechaPedido is string;
      
      // Validar que medicamentosSolicitados tenga estructura correcta
      allow write: if request.resource.data.medicamentosSolicitados.hasOnly([
        'id', 'nombre', 'presentacion', 'cantidad', 'medicamentoId', 'ubicacion'
      ]);
      
      // Validar que entregasRealizadas sean válidas cuando se marca atendido
      allow update: if request.resource.data.atendido == true
        ? request.resource.data.entregasRealizadas is list
        : true;
    }
  }
}


-- PARA USAR FIREBASE Y NO FIRESTORE
-- para cuando sea development
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
-- Para cuando esté en producción
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /medicamentos/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}