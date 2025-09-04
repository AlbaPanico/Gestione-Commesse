// src/components/FolderPicker.jsx
import React from 'react';

/**
 * Piccolo componente controllato:
 * - value: la cartella attuale
 * - onFolderChange: callback del genitore
 */
export default function FolderPicker({ value, onFolderChange }) {
  const handleChange = (e) => {
    onFolderChange(e.target.value);
  };

  return (
    <div>
      <label>
        Cartella:
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="Inserisci percorso cartella"
        />
      </label>
    </div>
  );
}
