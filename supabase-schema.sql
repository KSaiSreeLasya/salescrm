-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core lead fields
  name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  source TEXT,
  status TEXT DEFAULT 'new',
  owner_id UUID,
  notes TEXT,
  
  -- Custom fields from Google Sheet (stored as JSON)
  fields JSONB DEFAULT '{}'::jsonb,
  
  -- Sheet-specific columns (top-level for easy querying)
  what_type_of_property TEXT,
  average_monthly_bill TEXT,
  full_name TEXT,
  street_address TEXT,
  post_code TEXT,
  lead_status TEXT,
  note1 TEXT,
  note2 TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Indexes for performance
  CONSTRAINT check_status CHECK (status IN ('new', 'call', 'not lifted', 'not connected', 'voice message', 'quotation sent', 'site visit', 'advance payment', 'lead finished', 'contacted'))
);

CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_owner_id ON leads(owner_id);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);

-- Create salespersons table
CREATE TABLE IF NOT EXISTS salespersons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_salespersons_name ON salespersons(name);
CREATE INDEX idx_salespersons_active ON salespersons(active);

-- Create config table
CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  sheet_url TEXT,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  headers TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Prevent duplicate rows
  CONSTRAINT single_config CHECK (id = 1)
);

-- Insert default config row
INSERT INTO config (id, sheet_url, last_sync_at)
VALUES (1, 'https://docs.google.com/spreadsheets/d/1QY8_Q8-ybLKNVs4hynPZslZDwUfC-PIJrViJfL0-tpM/export?format=csv', NULL)
ON CONFLICT (id) DO UPDATE SET sheet_url = 'https://docs.google.com/spreadsheets/d/1QY8_Q8-ybLKNVs4hynPZslZDwUfC-PIJrViJfL0-tpM/export?format=csv';

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_config_updated_at BEFORE UPDATE ON config
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (if using service role)
GRANT SELECT, INSERT, UPDATE, DELETE ON leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON salespersons TO authenticated;
GRANT SELECT, UPDATE ON config TO authenticated;
