//! Thin wasm-bindgen layer over the `evtx` crate.
//!
//! The file is walked chunk by chunk the same way `EvtxParser` does it (every
//! 64 KiB slot after the 4 KiB header, not just `chunk_count` from the header),
//! so records in chunks that a dirty header does not account for are still read.

use std::sync::Arc;

use evtx::{EvtxChunkData, EvtxFileHeader, ParserSettings};
use serde_json::json;
use wasm_bindgen::prelude::*;

const FILE_HEADER_SIZE: usize = 4096;
const CHUNK_SIZE: usize = 65536;

fn settings() -> Arc<ParserSettings> {
    Arc::new(ParserSettings::new().num_threads(1).indent(false))
}

#[wasm_bindgen]
pub struct EvtxReader {
    data: Vec<u8>,
    settings: Arc<ParserSettings>,
}

#[wasm_bindgen]
impl EvtxReader {
    /// Takes ownership of the whole file. Fails when the file header magic is wrong.
    #[wasm_bindgen(constructor)]
    pub fn new(data: Vec<u8>) -> Result<EvtxReader, JsError> {
        EvtxFileHeader::from_bytes(&data).map_err(|e| JsError::new(&e.to_string()))?;
        Ok(EvtxReader { data, settings: settings() })
    }

    /// File header fields as a JSON object string.
    pub fn header(&self) -> String {
        let h = EvtxFileHeader::from_bytes(&self.data).expect("validated in constructor");
        json!({
            "firstChunk": h.first_chunk_number,
            "lastChunk": h.last_chunk_number,
            "nextRecordId": h.next_record_id,
            "majorVersion": h.major_version,
            "minorVersion": h.minor_version,
            "headerChunkCount": h.chunk_count,
            "dirty": h.flags.bits() & 0x1 != 0,
            "full": h.flags.bits() & 0x2 != 0,
        })
        .to_string()
    }

    /// Number of 64 KiB chunk slots physically present in the file.
    #[wasm_bindgen(js_name = slotCount)]
    pub fn slot_count(&self) -> usize {
        self.data.len().saturating_sub(FILE_HEADER_SIZE) / CHUNK_SIZE
    }

    /// Parses one chunk slot and returns a JSON object string:
    /// `{"empty":bool,"error":string|null,"checksumOk":bool,"records":[{"id","time","event"}],"recordErrors":[string]}`
    #[wasm_bindgen(js_name = parseChunk)]
    pub fn parse_chunk(&self, index: usize) -> String {
        let start = FILE_HEADER_SIZE + index * CHUNK_SIZE;
        let Some(bytes) = self.data.get(start..start + CHUNK_SIZE) else {
            return json!({"empty": true, "error": "chunk out of range"}).to_string();
        };
        parse_chunk_bytes(bytes.to_vec(), &self.settings)
    }
}

fn parse_chunk_bytes(bytes: Vec<u8>, settings: &Arc<ParserSettings>) -> String {
    if bytes.iter().all(|b| *b == 0) {
        return r#"{"empty":true,"error":null,"checksumOk":true,"records":[],"recordErrors":[]}"#.to_string();
    }
    let mut chunk_data = match EvtxChunkData::new(bytes, false) {
        Ok(c) => c,
        Err(e) => return json!({"empty": false, "error": e.to_string()}).to_string(),
    };
    let checksum_ok = chunk_data.validate_checksum();
    let mut chunk = match chunk_data.parse(Arc::clone(settings)) {
        Ok(c) => c,
        Err(e) => return json!({"empty": false, "error": e.to_string()}).to_string(),
    };

    let mut out = String::with_capacity(256 * 1024);
    out.push_str(r#"{"empty":false,"error":null,"checksumOk":"#);
    out.push_str(if checksum_ok { "true" } else { "false" });
    out.push_str(r#","records":["#);
    let mut errors: Vec<String> = Vec::new();
    let mut first = true;
    for record in chunk.iter() {
        let serialized = record.and_then(|r| r.into_json());
        match serialized {
            Ok(r) => {
                if !first {
                    out.push(',');
                }
                first = false;
                out.push_str(r#"{"id":"#);
                out.push_str(&r.event_record_id.to_string());
                out.push_str(r#","time":""#);
                out.push_str(&r.timestamp.to_string());
                out.push_str(r#"","event":"#);
                out.push_str(&r.data);
                out.push('}');
            }
            Err(e) => errors.push(e.to_string()),
        }
    }
    out.push_str(r#"],"recordErrors":"#);
    out.push_str(&serde_json::to_string(&errors).unwrap_or_else(|_| "[]".into()));
    out.push('}');
    out
}

/// Renders the XML of one record from a single chunk's bytes. Used by the
/// detail view so the full XML never has to be kept in memory.
#[wasm_bindgen(js_name = renderRecordXml)]
pub fn render_record_xml(chunk_bytes: Vec<u8>, record_id: u64) -> Option<String> {
    let settings = Arc::new(ParserSettings::new().num_threads(1).indent(true));
    let mut chunk_data = EvtxChunkData::new(chunk_bytes, false).ok()?;
    let mut chunk = chunk_data.parse(settings).ok()?;
    for record in chunk.iter().flatten() {
        if record.event_record_id == record_id {
            return record.into_xml().ok().map(|r| r.data);
        }
    }
    None
}

