// src/ModificaCommessa.jsx
import React, { useState, useEffect } from 'react';
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

export default function EspositoriApp() {
  // Stato per la lista delle commesse (ora simulata come oggetti)
  const [commesse, setCommesse] = useState([]);
  // Stato per la commessa selezionata (oggetto con tutti i campi)
  const [selectedCommessa, setSelectedCommessa] = useState({
    nome: '',
    cliente: '',
    brand: '',
    nomeProdotto: '',
    quantita: '',
    codiceProgetto: '',
    codiceCommessa: '',
    dataConsegna: '',
  });
  const [modificaOpen, setModificaOpen] = useState(false);

  // Simuliamo il fetch delle commesse al mount
  useEffect(() => {
    setCommesse([
      {
        nome: "Commessa_1",
        cliente: "Cliente1",
        brand: "Brand1",
        nomeProdotto: "Prodotto1",
        quantita: "10",
        codiceProgetto: "P001",
        codiceCommessa: "C001",
        dataConsegna: "2025-03-13",
      },
      {
        nome: "Commessa_2",
        cliente: "Cliente2",
        brand: "Brand2",
        nomeProdotto: "Prodotto2",
        quantita: "20",
        codiceProgetto: "P002",
        codiceCommessa: "C002",
        dataConsegna: "2025-03-14",
      },
      {
        nome: "Commessa_3",
        cliente: "Cliente3",
        brand: "Brand3",
        nomeProdotto: "Prodotto3",
        quantita: "30",
        codiceProgetto: "P003",
        codiceCommessa: "C003",
        dataConsegna: "2025-03-15",
      }
    ]);
  }, []);

  // Quando l'utente clicca su una commessa, precompiliamo tutti i campi
  const handleEditCommessa = (commessa) => {
    setSelectedCommessa(commessa);
    setModificaOpen(true);
  };

  return (
    <div className="relative flex min-h-screen bg-gray-900 p-4 text-white">
      {/* Lista delle commesse */}
      <div className="w-1/4 bg-gray-800 shadow-md p-4 overflow-y-auto h-screen">
        <h2 className="text-lg font-bold mb-2">Commesse Generate</h2>
        <ul>
          {commesse.length > 0 ? (
            commesse.map((commessa, index) => (
              <li 
                key={index} 
                className="p-2 border-b cursor-pointer hover:bg-gray-700"
                onClick={() => handleEditCommessa(commessa)}
              >
                {commessa.nome}
              </li>
            ))
          ) : (
            <p className="text-gray-300">Nessuna commessa disponibile</p>
          )}
        </ul>
      </div>

      {/* Form di modifica */}
      {modificaOpen && (
        <div className="absolute top-10 left-1/4 w-1/2 bg-gray-800 p-4 shadow-lg border border-gray-600 rounded-lg">
          <h2 className="text-lg font-bold mb-4">Modifica Commessa</h2>
          
          <label className="block mb-1 font-semibold text-white" htmlFor="nomeCommessa">
            Nome Commessa
          </label>
          <Input 
            id="nomeCommessa"
            type="text" 
            placeholder="Nome Commessa" 
            value={selectedCommessa.nome} 
            onChange={(e) => setSelectedCommessa({ ...selectedCommessa, nome: e.target.value })}
            className="!text-white placeholder:!text-white"
          />
          
          <label className="block mb-1 font-semibold text-white" htmlFor="cliente">
            Cliente
          </label>
          <Input 
            id="cliente"
            type="text" 
            placeholder="Cliente" 
            value={selectedCommessa.cliente} 
            onChange={(e) => setSelectedCommessa({ ...selectedCommessa, cliente: e.target.value })}
            className="!text-white placeholder:!text-white"
          />
          
          <label className="block mb-1 font-semibold text-white" htmlFor="brand">
            Brand
          </label>
          <Input 
            id="brand"
            type="text" 
            placeholder="Brand" 
            value={selectedCommessa.brand} 
            onChange={(e) => setSelectedCommessa({ ...selectedCommessa, brand: e.target.value })}
            className="!text-white placeholder:!text-white"
          />
          
          <label className="block mb-1 font-semibold text-white" htmlFor="nomeProdotto">
            Nome Prodotto
          </label>
          <Input 
            id="nomeProdotto"
            type="text" 
            placeholder="Nome Prodotto" 
            value={selectedCommessa.nomeProdotto} 
            onChange={(e) => setSelectedCommessa({ ...selectedCommessa, nomeProdotto: e.target.value })}
            className="!text-white placeholder:!text-white"
          />
          
          <label className="block mb-1 font-semibold text-white" htmlFor="quantita">
            Quantità
          </label>
          <Input 
            id="quantita"
            type="number" 
            placeholder="Quantità" 
            value={selectedCommessa.quantita} 
            onChange={(e) => setSelectedCommessa({ ...selectedCommessa, quantita: e.target.value })}
            className="!text-white placeholder:!text-white"
          />
          
          <label className="block mb-1 font-semibold text-white" htmlFor="codiceProgetto">
            Codice Progetto
          </label>
          <Input 
            id="codiceProgetto"
            type="text" 
            placeholder="Codice Progetto" 
            value={selectedCommessa.codiceProgetto} 
            onChange={(e) => setSelectedCommessa({ ...selectedCommessa, codiceProgetto: e.target.value })}
            className="!text-white placeholder:!text-white"
          />
          
          <label className="block mb-1 font-semibold text-white" htmlFor="codiceCommessa">
            Codice Commessa
          </label>
          <Input 
            id="codiceCommessa"
            type="text" 
            placeholder="Codice Commessa" 
            value={selectedCommessa.codiceCommessa} 
            onChange={(e) => setSelectedCommessa({ ...selectedCommessa, codiceCommessa: e.target.value })}
            className="!text-white placeholder:!text-white"
          />
          
          <label className="block mb-1 font-semibold text-white" htmlFor="dataConsegna">
            Data Consegna
          </label>
          <Input 
            id="dataConsegna"
            type="date" 
            placeholder="Data Consegna" 
            value={selectedCommessa.dataConsegna} 
            onChange={(e) => setSelectedCommessa({ ...selectedCommessa, dataConsegna: e.target.value })}
            className="!text-white placeholder:!text-white"
          />
          
          <div className="flex justify-end gap-2 mt-4">
            <Button onClick={() => setModificaOpen(false)}>Chiudi</Button>
            <Button onClick={() => alert("Modifiche salvate!")}>Salva</Button>
          </div>
        </div>
      )}
    </div>
  );
}
